import { Prisma, type Optimization } from "@prisma/client";
import {
  OptimizationDecision,
  OptimizationPriority,
  ReportStatus,
  ReportType,
  ServiceType,
} from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Client reporting and the optimization log.
 *
 * A report is the agency's account of its own performance, handed to the
 * person paying for it. That makes two things load-bearing:
 *
 * - the numbers have to have been checked, and
 * - somebody other than the author has to have read it.
 *
 * Neither is bureaucracy. An unchecked report is a guess presented as fact,
 * and a report only its author has read is that author marking their own
 * homework in front of the client. The same independence rule as QA, for the
 * same reason.
 *
 * An optimization is a claim that a change worked. A claim with no baseline
 * and no result cannot be judged, so a decision cannot be recorded without
 * both.
 */

export type ReportFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "SELF_REVIEW"
  | "UNVALIDATED_DATA"
  | "NOT_APPROVED";

export interface ReportFailure {
  ok: false;
  code: ReportFailureCode;
  message: string;
}

function failure(code: ReportFailureCode, message: string): ReportFailure {
  return { ok: false, code, message };
}

export const REPORT_FAILURE_STATUS: Record<ReportFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  SELF_REVIEW: 409,
  UNVALIDATED_DATA: 409,
  NOT_APPROVED: 409,
};

export const REPORT_TYPES = [
  { value: ReportType.WEEKLY_UPDATE, label: "Weekly update" },
  { value: ReportType.MONTHLY_REPORT, label: "Monthly report" },
  { value: ReportType.QUARTERLY_BUSINESS_REVIEW, label: "Quarterly business review" },
  { value: ReportType.LAUNCH_REPORT, label: "Launch report" },
  { value: ReportType.FINAL_REPORT, label: "Final report" },
] as const;

export const OPTIMIZATION_DECISIONS = [
  { value: OptimizationDecision.PENDING, label: "Still running" },
  { value: OptimizationDecision.KEEP, label: "Keep" },
  { value: OptimizationDecision.ADJUST, label: "Adjust" },
  { value: OptimizationDecision.REVERSE, label: "Reverse" },
  { value: OptimizationDecision.CONTINUE_TESTING, label: "Continue testing" },
  { value: OptimizationDecision.INCONCLUSIVE, label: "Inconclusive" },
] as const;

/** Decisions that claim the experiment is over and answered. */
const CONCLUDED_DECISIONS: readonly OptimizationDecision[] = [
  OptimizationDecision.KEEP,
  OptimizationDecision.ADJUST,
  OptimizationDecision.REVERSE,
  OptimizationDecision.INCONCLUSIVE,
];

export function isOptimizationConcluded(decision: OptimizationDecision) {
  return CONCLUDED_DECISIONS.includes(decision);
}

export interface LatenessInput {
  status: ReportStatus;
  dueAt: Date | null;
  sentAt: Date | null;
}

/**
 * Whether a report is late.
 *
 * Derived rather than stored. The ReportStatus enum has a LATE value, but
 * writing it would need something to sweep the table on a timer, and a status
 * that only updates when a job runs is wrong between runs. Lateness is a fact
 * about the clock, so it is computed from the clock.
 */
export function isReportLate(report: LatenessInput, now = new Date()) {
  if (!report.dueAt) {
    return false;
  }

  if (report.sentAt) {
    return report.sentAt.getTime() > report.dueAt.getTime();
  }

  return (
    report.status !== ReportStatus.ACKNOWLEDGED && now.getTime() > report.dueAt.getTime()
  );
}

/**
 * Scoped by assigned work, not only by account ownership.
 *
 * The ads specialist writes the performance reporting but almost never owns
 * the client relationship - that is the project manager's. Scoping this by
 * ownership alone would mean the person who produces the numbers cannot record
 * them. Same reasoning as raising a defect.
 */
async function loadClient(actor: AuthContext, clientId: string) {
  const scope = can(actor, "clients.view.all")
    ? {}
    : {
        OR: [
          { assignedUserId: actor.id },
          { agencyTasks: { some: { assignedToId: actor.id, deletedAt: null } } },
        ],
      };

  return prisma.client.findFirst({
    where: { id: clientId, deletedAt: null, ...scope },
    select: { id: true, companyName: true, assignedUserId: true },
  });
}

export interface SaveReportInput {
  actor: AuthContext;
  clientId: string;
  reportId?: string | null;
  type: ReportType;
  periodStart: Date;
  periodEnd: Date;
  dueAt?: Date | null;
  dataSources?: string | null;
  knownLimitations?: string | null;
  recommendedActions?: string | null;
  documentUrl?: string | null;
  dataValidated?: boolean;
}

/**
 * Creates or updates a report draft.
 *
 * Editing a report that has already gone out is refused rather than silently
 * allowed: the client is holding a copy, and quietly changing the agency's
 * record of what was said makes the two disagree.
 */
export async function saveReport(input: SaveReportInput) {
  const { actor, clientId } = input;

  if (!can(actor, "reporting.client")) {
    return failure("FORBIDDEN", "You do not have permission to prepare client reports.");
  }

  if (input.periodEnd.getTime() <= input.periodStart.getTime()) {
    return failure("INVALID", "The reporting period has to end after it starts.");
  }

  if (input.periodStart.getTime() > Date.now()) {
    return failure("INVALID", "A reporting period cannot start in the future.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const data = {
    type: input.type,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    dueAt: input.dueAt ?? null,
    dataSources: input.dataSources?.trim() || null,
    knownLimitations: input.knownLimitations?.trim() || null,
    recommendedActions: input.recommendedActions?.trim() || null,
    documentUrl: input.documentUrl?.trim() || null,
    // Recorded as the moment somebody said they checked, not as a bare flag,
    // so "validated" always carries a date.
    dataValidatedAt: input.dataValidated ? new Date() : null,
  };

  if (input.reportId) {
    const existing = await prisma.clientReport.findFirst({
      where: { id: input.reportId, clientId: client.id },
      select: { id: true, status: true, sentAt: true, dataValidatedAt: true },
    });

    if (!existing) {
      return failure("NOT_FOUND", "Report not found.");
    }

    if (existing.sentAt) {
      return failure(
        "INVALID",
        "This report has already gone to the client. Prepare a corrected one rather than editing the copy they are holding.",
      );
    }

    const report = await prisma.clientReport.update({
      where: { id: existing.id },
      data: {
        ...data,
        // Keep an earlier validation timestamp when the editor did not
        // re-tick the box, rather than quietly discarding the check.
        dataValidatedAt: data.dataValidatedAt ?? existing.dataValidatedAt,
      },
    });

    await logActivity({
      actorId: actor.id,
      action: `Updated the ${input.type.toLowerCase().replaceAll("_", " ")} for ${client.companyName}`,
      entityType: "CLIENT",
      entityId: client.id,
      metadataJson: { reportId: report.id },
    });

    return { ok: true as const, report };
  }

  const report = await prisma.clientReport.create({
    data: { ...data, clientId: client.id, preparedById: actor.id },
  });

  await logActivity({
    actorId: actor.id,
    action: `Started the ${input.type.toLowerCase().replaceAll("_", " ")} for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { reportId: report.id },
  });

  return { ok: true as const, report };
}

/**
 * Approves a report for sending.
 *
 * The preparer cannot approve their own. In a six-person agency this usually
 * means the project manager or owner reads what the ads specialist wrote
 * before the client does.
 */
export async function reviewReport(input: {
  actor: AuthContext;
  reportId: string;
  approve: boolean;
  note?: string | null;
}) {
  const { actor, reportId, approve } = input;

  if (!can(actor, "reporting.client")) {
    return failure("FORBIDDEN", "You do not have permission to review client reports.");
  }

  const report = await prisma.clientReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      clientId: true,
      type: true,
      status: true,
      sentAt: true,
      preparedById: true,
      dataValidatedAt: true,
      client: { select: { id: true, companyName: true, assignedUserId: true } },
    },
  });

  if (!report) {
    return failure("NOT_FOUND", "Report not found.");
  }

  const client = await loadClient(actor, report.clientId);

  if (!client) {
    return failure("NOT_FOUND", "Report not found.");
  }

  if (report.sentAt) {
    return failure("INVALID", "This report has already been sent.");
  }

  if (!approve) {
    const note = input.note?.trim();

    if (!note) {
      return failure("INVALID", "Say what needs changing, or the author cannot act on it.");
    }

    const updated = await prisma.clientReport.update({
      where: { id: report.id },
      data: { status: ReportStatus.DRAFT, reviewedById: null },
    });

    await logActivity({
      actorId: actor.id,
      action: `Sent the ${report.type.toLowerCase().replaceAll("_", " ")} for ${client.companyName} back to draft`,
      entityType: "CLIENT",
      entityId: client.id,
      metadataJson: { reportId: report.id, note },
    });

    await createNotifications(
      resolveRecipients([report.preparedById], actor.id).map((recipientId) => ({
        recipientId,
        type: "REVISION_REQUEST" as const,
        urgency: "NORMAL" as const,
        title: `Report needs changes: ${client.companyName}`,
        body: note,
        entityType: "CLIENT" as const,
        entityId: client.id,
        href: `/clients/${client.id}`,
      })),
    );

    return { ok: true as const, report: updated };
  }

  if (report.preparedById && report.preparedById === actor.id) {
    return failure(
      "SELF_REVIEW",
      "You prepared this report, so somebody else has to review it before the client sees it.",
    );
  }

  if (!report.dataValidatedAt) {
    return failure(
      "UNVALIDATED_DATA",
      "Nobody has confirmed the figures were checked against their sources. Approving unchecked numbers puts a guess in front of the client.",
    );
  }

  const approved = await prisma.clientReport.update({
    where: { id: report.id },
    data: { status: ReportStatus.APPROVED, reviewedById: actor.id },
  });

  await logActivity({
    actorId: actor.id,
    action: `Approved the ${report.type.toLowerCase().replaceAll("_", " ")} for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    fieldName: "reportStatus",
    previousValue: report.status,
    newValue: approved.status,
    metadataJson: { reportId: report.id },
  });

  await createNotifications(
    resolveRecipients([report.preparedById, report.client.assignedUserId], actor.id).map(
      (recipientId) => ({
        recipientId,
        type: "REPORT_DUE" as const,
        urgency: "NORMAL" as const,
        title: `Report approved: ${client.companyName}`,
        body: "It can go to the client now.",
        entityType: "CLIENT" as const,
        entityId: client.id,
        href: `/clients/${client.id}`,
      }),
    ),
  );

  return { ok: true as const, report: approved };
}

/** Submits a draft for review. */
export async function submitReportForReview(input: {
  actor: AuthContext;
  reportId: string;
}) {
  const { actor, reportId } = input;

  if (!can(actor, "reporting.client")) {
    return failure("FORBIDDEN", "You do not have permission to submit client reports.");
  }

  const report = await prisma.clientReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      clientId: true,
      type: true,
      status: true,
      sentAt: true,
      preparedById: true,
      dataValidatedAt: true,
    },
  });

  if (!report) {
    return failure("NOT_FOUND", "Report not found.");
  }

  const client = await loadClient(actor, report.clientId);

  if (!client) {
    return failure("NOT_FOUND", "Report not found.");
  }

  if (report.sentAt) {
    return failure("INVALID", "This report has already been sent.");
  }

  if (!report.dataValidatedAt) {
    return failure(
      "UNVALIDATED_DATA",
      "Confirm the figures were checked against their sources before asking somebody to review it.",
    );
  }

  const updated = await prisma.clientReport.update({
    where: { id: report.id },
    data: { status: ReportStatus.IN_REVIEW },
  });

  const reviewers = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      teamRole: { in: ["AGENCY_OWNER", "PROJECT_MANAGER"] },
    },
    select: { id: true },
  });

  await createNotifications(
    resolveRecipients(
      reviewers.map((user) => user.id).filter((id) => id !== report.preparedById),
      actor.id,
    ).map((recipientId) => ({
      recipientId,
      type: "REPORT_DUE" as const,
      urgency: "NORMAL" as const,
      title: `Report awaiting review: ${client.companyName}`,
      body: "The client cannot receive it until somebody other than the author approves it.",
      entityType: "CLIENT" as const,
      entityId: client.id,
      href: `/clients/${client.id}`,
    })),
  );

  return { ok: true as const, report: updated };
}

/**
 * Marks a report as sent, or as acknowledged by the client.
 *
 * Sending requires an approval that somebody else gave. Everything upstream of
 * this is preparation; this is the moment it leaves the agency.
 */
export async function deliverReport(input: {
  actor: AuthContext;
  reportId: string;
  acknowledged?: boolean;
}) {
  const { actor, reportId } = input;

  if (!can(actor, "reporting.client")) {
    return failure("FORBIDDEN", "You do not have permission to send client reports.");
  }

  const report = await prisma.clientReport.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      clientId: true,
      type: true,
      status: true,
      sentAt: true,
      reviewedById: true,
      preparedById: true,
    },
  });

  if (!report) {
    return failure("NOT_FOUND", "Report not found.");
  }

  const client = await loadClient(actor, report.clientId);

  if (!client) {
    return failure("NOT_FOUND", "Report not found.");
  }

  if (input.acknowledged) {
    if (!report.sentAt) {
      return failure("INVALID", "This report has not been sent yet.");
    }

    const acknowledged = await prisma.clientReport.update({
      where: { id: report.id },
      data: { status: ReportStatus.ACKNOWLEDGED, clientAcknowledgedAt: new Date() },
    });

    await logActivity({
      actorId: actor.id,
      action: `Recorded that ${client.companyName} acknowledged their report`,
      entityType: "CLIENT",
      entityId: client.id,
      metadataJson: { reportId: report.id },
    });

    return { ok: true as const, report: acknowledged };
  }

  if (report.sentAt) {
    return failure("INVALID", "This report has already been sent.");
  }

  if (report.status !== ReportStatus.APPROVED || !report.reviewedById) {
    return failure(
      "NOT_APPROVED",
      "This report has not been approved by a second person yet.",
    );
  }

  const sent = await prisma.clientReport.update({
    where: { id: report.id },
    data: { status: ReportStatus.SENT, sentAt: new Date() },
  });

  await logActivity({
    actorId: actor.id,
    action: `Sent the ${report.type.toLowerCase().replaceAll("_", " ")} to ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    fieldName: "reportStatus",
    previousValue: report.status,
    newValue: sent.status,
    metadataJson: { reportId: report.id },
  });

  return { ok: true as const, report: sent };
}

export interface SaveOptimizationInput {
  actor: AuthContext;
  clientId: string;
  optimizationId?: string | null;
  platform: string;
  observedProblem: string;
  proposedChange: string;
  evidence?: string | null;
  hypothesis?: string | null;
  expectedMetric?: string | null;
  previousSetting?: string | null;
  newSetting?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  result?: string | null;
  decision?: OptimizationDecision;
  ownerId?: string | null;
  title?: string | null;
  priority?: OptimizationPriority;
  serviceType?: ServiceType | null;
  /** An existing task this initiative is meant to drive. Never created here. */
  taskId?: string | null;
  /** One submission of the form, so a double-click cannot make two records. */
  idempotencyKey?: string | null;
  metricBefore?: string | null;
  metricAfter?: string | null;
  notes?: string | null;
  now?: Date;
}

/**
 * Records or updates an optimization.
 *
 * Concluding one - keep, adjust, reverse, inconclusive - requires a result and
 * a baseline. Without the setting it replaced there is nothing to compare
 * against, and "keep" becomes a preference rather than a finding.
 */
export async function saveOptimization(input: SaveOptimizationInput) {
  const { actor, clientId } = input;

  if (!can(actor, "reporting.client")) {
    return failure("FORBIDDEN", "You do not have permission to record optimizations.");
  }

  const platform = input.platform.trim();
  const observedProblem = input.observedProblem.trim();
  const proposedChange = input.proposedChange.trim();

  if (!platform || !observedProblem || !proposedChange) {
    return failure(
      "INVALID",
      "An optimization needs the platform, the problem you saw, and what you changed.",
    );
  }

  const decision = input.decision ?? OptimizationDecision.PENDING;
  const result = input.result?.trim() || null;
  const previousSetting = input.previousSetting?.trim() || null;

  if (isOptimizationConcluded(decision)) {
    if (!result) {
      return failure(
        "INVALID",
        "Record what actually happened before deciding. A decision with no result is a guess with a label on it.",
      );
    }

    if (!previousSetting) {
      return failure(
        "INVALID",
        "Record what the setting was before the change, or there is nothing to compare the result against.",
      );
    }
  }

  if (
    input.startDate
    && input.endDate
    && input.endDate.getTime() < input.startDate.getTime()
  ) {
    return failure("INVALID", "The test cannot end before it starts.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const title = input.title?.trim() || null;

  /*
   * The task is looked up rather than trusted: an id from another account
   * would otherwise attach this client's optimization to somebody else's work.
   * No task is ever created here - an optimization is what we are trying to
   * improve, a task is the work, and the task system already owns the second.
   */
  let taskId: string | null = null;

  if (input.taskId?.trim()) {
    const task = await prisma.employeeTask.findFirst({
      where: { id: input.taskId.trim(), clientId: client.id, deletedAt: null },
      select: { id: true },
    });

    if (!task) {
      return failure("NOT_FOUND", "That task does not belong to this client.");
    }

    taskId = task.id;
  }

  const data = {
    title,
    platform,
    observedProblem,
    proposedChange,
    evidence: input.evidence?.trim() || null,
    hypothesis: input.hypothesis?.trim() || null,
    expectedMetric: input.expectedMetric?.trim() || null,
    previousSetting,
    newSetting: input.newSetting?.trim() || null,
    metricBefore: input.metricBefore?.trim() || null,
    metricAfter: input.metricAfter?.trim() || null,
    notes: input.notes?.trim() || null,
    priority: input.priority ?? OptimizationPriority.MEDIUM,
    serviceType: input.serviceType ?? null,
    taskId,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    result,
    decision,
    ownerId: input.ownerId?.trim() || actor.id,
  };

  if (input.optimizationId) {
    const existing = await prisma.optimization.findFirst({
      where: { id: input.optimizationId, clientId: client.id },
      select: { id: true, decision: true },
    });

    if (!existing) {
      return failure("NOT_FOUND", "Optimization not found.");
    }

    const optimization = await prisma.optimization.update({
      where: { id: existing.id },
      data,
    });

    await logActivity({
      actorId: actor.id,
      action: `Updated a ${platform} optimization for ${client.companyName}`,
      entityType: "CLIENT",
      entityId: client.id,
      ...(existing.decision !== decision
        ? {
            fieldName: "optimizationDecision",
            previousValue: existing.decision,
            newValue: decision,
          }
        : {}),
      metadataJson: { optimizationId: optimization.id },
    });

    return { ok: true as const, optimization };
  }

  /*
   * A double-click posts twice and both requests are valid on their own.
   *
   * Checking for a recent twin before inserting does not work: two requests
   * that arrive together both read before either writes, and both then write.
   * The unique index is the only thing that can decide, so the form carries a
   * key for the submission and the loser of the race is handed the record the
   * winner made.
   */
  const key = input.idempotencyKey?.trim() || null;

  if (key) {
    const existing = await prisma.optimization.findUnique({ where: { idempotencyKey: key } });

    if (existing) {
      return { ok: true as const, optimization: existing, deduplicated: true as const };
    }
  }

  try {
    const optimization = await prisma.optimization.create({
      data: { ...data, clientId: client.id, createdById: actor.id, idempotencyKey: key },
    });

    return await recordCreation(actor, client, platform, optimization);
  } catch (error) {
    /* P2002: the other request won. Hand back what it made. */
    if (key && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.optimization.findUnique({ where: { idempotencyKey: key } });

      if (winner) {
        return { ok: true as const, optimization: winner, deduplicated: true as const };
      }
    }

    throw error;
  }
}

/** The activity line for a newly created optimization. */
async function recordCreation(
  actor: AuthContext,
  client: { id: string; companyName: string },
  platform: string,
  optimization: Optimization,
) {

  await logActivity({
    actorId: actor.id,
    action: `Recorded a ${platform} optimization for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { optimizationId: optimization.id },
  });

  return { ok: true as const, optimization };
}
