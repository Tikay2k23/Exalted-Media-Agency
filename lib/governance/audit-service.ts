import {
  AuditStatus,
  AuditType,
  ComplianceStatus,
  CorrectiveActionStatus,
  ImprovementPriority,
  ImprovementStatus,
} from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Audits, corrective actions, and the improvement backlog.
 *
 * An audit that finds problems and produces nothing is worse than no audit: it
 * costs a day and buys the comfortable feeling of having looked. So the
 * conditions here are about what happens after a finding, not about recording
 * one.
 *
 * Two rules carry that:
 *
 * - an audit cannot be completed while a critical failure has no corrective
 *   action against it, and
 * - the person who did the correction cannot be the person who verifies it.
 *
 * The second is the same rule as QA, the strategy brief, and client reports.
 * It applies here for the same reason it applies there.
 */

export type AuditFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "SELF_VERIFICATION"
  | "UNRESOLVED_CRITICAL";

export interface AuditFailure {
  ok: false;
  code: AuditFailureCode;
  message: string;
  outstanding?: string[];
}

function failure(
  code: AuditFailureCode,
  message: string,
  outstanding?: string[],
): AuditFailure {
  return { ok: false, code, message, outstanding };
}

export const AUDIT_FAILURE_STATUS: Record<AuditFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  SELF_VERIFICATION: 409,
  UNRESOLVED_CRITICAL: 409,
};

export const AUDIT_TYPES = [
  { value: AuditType.ROUTINE, label: "Routine" },
  { value: AuditType.SPOT, label: "Spot check" },
  { value: AuditType.INCIDENT, label: "After an incident" },
  { value: AuditType.CLIENT, label: "Client account" },
  { value: AuditType.DEPARTMENT, label: "Department" },
  { value: AuditType.PLATFORM, label: "Platform" },
  { value: AuditType.ANNUAL_GOVERNANCE, label: "Annual governance" },
] as const;

export const COMPLIANCE_RESULTS = [
  { value: ComplianceStatus.COMPLIANT, label: "Compliant" },
  { value: ComplianceStatus.PARTIALLY_COMPLIANT, label: "Partially compliant" },
  { value: ComplianceStatus.NON_COMPLIANT, label: "Non-compliant" },
  { value: ComplianceStatus.CRITICAL_FAILURE, label: "Critical failure" },
  { value: ComplianceStatus.NOT_APPLICABLE, label: "Not applicable" },
] as const;

export const IMPROVEMENT_PRIORITIES = [
  { value: ImprovementPriority.PRIORITY_ONE, label: "Priority 1" },
  { value: ImprovementPriority.PRIORITY_TWO, label: "Priority 2" },
  { value: ImprovementPriority.PRIORITY_THREE, label: "Priority 3" },
  { value: ImprovementPriority.PRIORITY_FOUR, label: "Priority 4" },
] as const;

export const IMPROVEMENT_STATUSES = [
  { value: ImprovementStatus.PROPOSED, label: "Proposed" },
  { value: ImprovementStatus.ACCEPTED, label: "Accepted" },
  { value: ImprovementStatus.IN_PROGRESS, label: "In progress" },
  { value: ImprovementStatus.IMPLEMENTED, label: "Implemented" },
  { value: ImprovementStatus.REJECTED, label: "Rejected" },
  { value: ImprovementStatus.DEFERRED, label: "Deferred" },
] as const;

const OPEN_ACTION_STATUSES: readonly CorrectiveActionStatus[] = [
  CorrectiveActionStatus.OPEN,
  CorrectiveActionStatus.IN_PROGRESS,
  CorrectiveActionStatus.AWAITING_VERIFICATION,
  CorrectiveActionStatus.OVERDUE,
];

export function isCorrectiveActionOpen(status: CorrectiveActionStatus) {
  return OPEN_ACTION_STATUSES.includes(status);
}

export interface ResolvableFinding {
  title: string;
  result: ComplianceStatus;
  isCritical: boolean;
  correctiveActions: { status: CorrectiveActionStatus }[];
}

/**
 * Findings serious enough to need a corrective action before the audit closes.
 *
 * Pure, and shared by the service and the screen so the button and the rule
 * cannot drift apart.
 */
export function findingNeedsAction(finding: ResolvableFinding) {
  return finding.isCritical || finding.result === ComplianceStatus.CRITICAL_FAILURE;
}

/** Critical findings that still have nothing being done about them. */
export function unresolvedCriticalFindings(findings: ResolvableFinding[]) {
  return findings.filter(
    (finding) => findingNeedsAction(finding) && finding.correctiveActions.length === 0,
  );
}

/** Whether a corrective action is past its due date and still open. */
export function isCorrectiveActionOverdue(
  action: { status: CorrectiveActionStatus; dueDate: Date | null },
  now = new Date(),
) {
  if (!action.dueDate || !isCorrectiveActionOpen(action.status)) {
    return false;
  }

  return now.getTime() > action.dueDate.getTime();
}

async function leadership() {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      teamRole: { in: ["AGENCY_OWNER", "PROJECT_MANAGER"] },
    },
    select: { id: true },
  });

  return users.map((user) => user.id);
}

export async function saveAudit(input: {
  actor: AuthContext;
  auditId?: string | null;
  reference?: string | null;
  type: AuditType;
  scope: string;
  clientId?: string | null;
  auditorId?: string | null;
  summary?: string | null;
  complianceScore?: number | null;
  overallResult?: ComplianceStatus | null;
  conductedAt?: Date | null;
}) {
  const { actor } = input;

  if (!can(actor, "governance.audit")) {
    return failure("FORBIDDEN", "You do not have permission to run audits.");
  }

  const scope = input.scope.trim();

  if (!scope) {
    return failure("INVALID", "Say what this audit covers.");
  }

  if (
    input.complianceScore !== null
    && input.complianceScore !== undefined
    && (input.complianceScore < 0 || input.complianceScore > 100)
  ) {
    return failure("INVALID", "The compliance score must be between 0 and 100.");
  }

  const data = {
    type: input.type,
    scope,
    clientId: input.clientId?.trim() || null,
    auditorId: input.auditorId?.trim() || actor.id,
    summary: input.summary?.trim() || null,
    complianceScore: input.complianceScore ?? null,
    overallResult: input.overallResult ?? null,
    conductedAt: input.conductedAt ?? new Date(),
  };

  if (input.auditId) {
    const existing = await prisma.audit.findUnique({
      where: { id: input.auditId },
      select: { id: true, reference: true, status: true },
    });

    if (!existing) {
      return failure("NOT_FOUND", "Audit not found.");
    }

    if (existing.status === AuditStatus.COMPLETE) {
      return failure(
        "INVALID",
        "This audit is complete. Raise a new one rather than rewriting the record of what was found.",
      );
    }

    const audit = await prisma.audit.update({ where: { id: existing.id }, data });

    await logActivity({
      actorId: actor.id,
      action: `Updated audit ${existing.reference}`,
      entityType: "SYSTEM",
      entityId: audit.id,
    });

    return { ok: true as const, audit };
  }

  // Sequential, human-readable reference. Generated rather than typed so two
  // audits cannot share one.
  const count = await prisma.audit.count();
  const reference =
    input.reference?.trim() || `AUD-${String(count + 1).padStart(4, "0")}`;

  const audit = await prisma.audit.create({
    data: { ...data, reference, status: AuditStatus.IN_PROGRESS },
  });

  await logActivity({
    actorId: actor.id,
    action: `Started audit ${reference}: ${scope}`,
    entityType: "SYSTEM",
    entityId: audit.id,
  });

  return { ok: true as const, audit };
}

export async function recordFinding(input: {
  actor: AuthContext;
  auditId: string;
  title: string;
  detail: string;
  result: ComplianceStatus;
  isCritical?: boolean;
  sopId?: string | null;
  evidenceUrl?: string | null;
}) {
  const { actor, auditId } = input;

  if (!can(actor, "governance.audit")) {
    return failure("FORBIDDEN", "You do not have permission to record audit findings.");
  }

  const title = input.title.trim();
  const detail = input.detail.trim();

  if (!title || !detail) {
    return failure("INVALID", "A finding needs a title and what was actually found.");
  }

  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    select: { id: true, reference: true, status: true },
  });

  if (!audit) {
    return failure("NOT_FOUND", "Audit not found.");
  }

  if (audit.status === AuditStatus.COMPLETE) {
    return failure("INVALID", "This audit is already complete.");
  }

  const isCritical =
    input.isCritical ?? input.result === ComplianceStatus.CRITICAL_FAILURE;

  const finding = await prisma.auditFinding.create({
    data: {
      auditId: audit.id,
      title,
      detail,
      result: input.result,
      isCritical,
      sopId: input.sopId?.trim() || null,
      evidenceUrl: input.evidenceUrl?.trim() || null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Recorded a finding on ${audit.reference}: ${title}`,
    entityType: "SYSTEM",
    entityId: audit.id,
    metadataJson: { findingId: finding.id, result: input.result, isCritical },
  });

  if (isCritical) {
    await createNotifications(
      resolveRecipients(await leadership(), actor.id).map((recipientId) => ({
        recipientId,
        type: "AUDIT_FINDING" as const,
        urgency: "CRITICAL" as const,
        title: `Critical audit finding: ${title}`,
        body: detail,
        entityType: "SYSTEM" as const,
        entityId: audit.id,
        href: "/governance",
      })),
    );
  }

  return { ok: true as const, finding };
}

/**
 * Completes an audit.
 *
 * Refused while a critical finding has nothing being done about it. An audit
 * that closes over an unanswered critical failure is a record that the agency
 * noticed and moved on.
 */
export async function completeAudit(input: { actor: AuthContext; auditId: string }) {
  const { actor, auditId } = input;

  if (!can(actor, "governance.audit")) {
    return failure("FORBIDDEN", "You do not have permission to complete audits.");
  }

  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      reference: true,
      status: true,
      findings: {
        select: {
          title: true,
          result: true,
          isCritical: true,
          correctiveActions: { select: { status: true } },
        },
      },
    },
  });

  if (!audit) {
    return failure("NOT_FOUND", "Audit not found.");
  }

  if (audit.status === AuditStatus.COMPLETE) {
    return failure("INVALID", "This audit is already complete.");
  }

  const unresolved = unresolvedCriticalFindings(audit.findings);

  if (unresolved.length) {
    return failure(
      "UNRESOLVED_CRITICAL",
      "Every critical finding needs a corrective action before this audit can be closed.",
      unresolved.map((finding) => finding.title),
    );
  }

  const completed = await prisma.audit.update({
    where: { id: audit.id },
    data: { status: AuditStatus.COMPLETE, completedAt: new Date() },
  });

  await logActivity({
    actorId: actor.id,
    action: `Completed audit ${audit.reference}`,
    entityType: "SYSTEM",
    entityId: audit.id,
    fieldName: "auditStatus",
    previousValue: audit.status,
    newValue: AuditStatus.COMPLETE,
  });

  return { ok: true as const, audit: completed };
}

export async function saveCorrectiveAction(input: {
  actor: AuthContext;
  actionId?: string | null;
  findingId?: string | null;
  title: string;
  risk?: string | null;
  immediateCorrection?: string | null;
  rootCause?: string | null;
  processCorrection?: string | null;
  status?: CorrectiveActionStatus;
  ownerId?: string | null;
  dueDate?: Date | null;
  evidenceUrl?: string | null;
}) {
  const { actor } = input;

  if (!can(actor, "governance.correctiveAction")) {
    return failure("FORBIDDEN", "You do not have permission to manage corrective actions.");
  }

  const title = input.title.trim();

  if (!title) {
    return failure("INVALID", "Say what is being corrected.");
  }

  const status = input.status ?? CorrectiveActionStatus.OPEN;

  // Verification and closure are separate operations, so they cannot be
  // reached by an ordinary update.
  if (
    status === CorrectiveActionStatus.VERIFIED
    || status === CorrectiveActionStatus.CLOSED
  ) {
    return failure(
      "INVALID",
      "Verify the action rather than setting its status, so the system records who checked it.",
    );
  }

  const data = {
    title,
    risk: input.risk?.trim() || null,
    immediateCorrection: input.immediateCorrection?.trim() || null,
    rootCause: input.rootCause?.trim() || null,
    processCorrection: input.processCorrection?.trim() || null,
    status,
    ownerId: input.ownerId?.trim() || actor.id,
    dueDate: input.dueDate ?? null,
    evidenceUrl: input.evidenceUrl?.trim() || null,
  };

  if (input.actionId) {
    const existing = await prisma.correctiveAction.findUnique({
      where: { id: input.actionId },
      select: { id: true, closedAt: true },
    });

    if (!existing) {
      return failure("NOT_FOUND", "Corrective action not found.");
    }

    if (existing.closedAt) {
      return failure("INVALID", "This corrective action is closed.");
    }

    const action = await prisma.correctiveAction.update({
      where: { id: existing.id },
      data,
    });

    await logActivity({
      actorId: actor.id,
      action: `Updated the corrective action "${title}"`,
      entityType: "SYSTEM",
      entityId: action.id,
    });

    return { ok: true as const, action };
  }

  const action = await prisma.correctiveAction.create({
    data: { ...data, findingId: input.findingId?.trim() || null },
  });

  await logActivity({
    actorId: actor.id,
    action: `Raised a corrective action: ${title}`,
    entityType: "SYSTEM",
    entityId: action.id,
    metadataJson: { findingId: input.findingId ?? null },
  });

  return { ok: true as const, action };
}

/**
 * Verifies and closes a corrective action.
 *
 * The owner cannot verify their own. Checking your own homework is exactly the
 * failure mode an audit exists to catch, so allowing it here would make the
 * corrective-action register a list of things people said they had done.
 */
export async function verifyCorrectiveAction(input: {
  actor: AuthContext;
  actionId: string;
  note?: string | null;
}) {
  const { actor, actionId } = input;

  if (!can(actor, "governance.correctiveAction")) {
    return failure("FORBIDDEN", "You do not have permission to verify corrective actions.");
  }

  const action = await prisma.correctiveAction.findUnique({
    where: { id: actionId },
    select: {
      id: true,
      title: true,
      status: true,
      ownerId: true,
      rootCause: true,
      closedAt: true,
    },
  });

  if (!action) {
    return failure("NOT_FOUND", "Corrective action not found.");
  }

  if (action.closedAt) {
    return failure("INVALID", "This corrective action is already closed.");
  }

  if (action.ownerId && action.ownerId === actor.id) {
    return failure(
      "SELF_VERIFICATION",
      "You own this corrective action, so somebody else has to verify it was actually done.",
    );
  }

  if (!action.rootCause?.trim()) {
    return failure(
      "INVALID",
      "Record the root cause before closing this. Without it the same finding comes back next audit.",
    );
  }

  const now = new Date();

  const verified = await prisma.correctiveAction.update({
    where: { id: action.id },
    data: {
      status: CorrectiveActionStatus.CLOSED,
      verifiedById: actor.id,
      verifiedAt: now,
      closedAt: now,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Verified and closed the corrective action "${action.title}"`,
    entityType: "SYSTEM",
    entityId: action.id,
    fieldName: "correctiveActionStatus",
    previousValue: action.status,
    newValue: CorrectiveActionStatus.CLOSED,
    metadataJson: { note: input.note?.trim() ?? null },
  });

  await createNotifications(
    resolveRecipients([action.ownerId], actor.id).map((recipientId) => ({
      recipientId,
      type: "CORRECTIVE_ACTION_OVERDUE" as const,
      urgency: "NORMAL" as const,
      title: `Corrective action verified: ${action.title}`,
      body: `${actor.name} confirmed this was done.`,
      entityType: "SYSTEM" as const,
      entityId: action.id,
      href: "/governance",
    })),
  );

  return { ok: true as const, action: verified };
}

/**
 * The improvement backlog.
 *
 * Deliberately open to everybody who can see governance: SOP 10 says every
 * team member takes part in process improvement, and a backlog only leadership
 * can write to collects only leadership's ideas.
 */
export async function saveImprovement(input: {
  actor: AuthContext;
  improvementId?: string | null;
  title: string;
  problem: string;
  source?: string | null;
  proposedSolution?: string | null;
  benefit?: string | null;
  effortEstimate?: string | null;
  priority?: ImprovementPriority;
  status?: ImprovementStatus;
  ownerId?: string | null;
  result?: string | null;
}) {
  const { actor } = input;

  if (!can(actor, "governance.view")) {
    return failure("FORBIDDEN", "You do not have permission to use the improvement backlog.");
  }

  const title = input.title.trim();
  const problem = input.problem.trim();

  if (!title || !problem) {
    return failure("INVALID", "Say what the problem is, not only what to build.");
  }

  const status = input.status ?? ImprovementStatus.PROPOSED;
  const result = input.result?.trim() || null;

  if (status === ImprovementStatus.IMPLEMENTED && !result) {
    return failure(
      "INVALID",
      "Record what changed as a result. An improvement nobody measured is a change, not an improvement.",
    );
  }

  // Deciding an item's fate is leadership's call; proposing one is not.
  if (
    (status === ImprovementStatus.ACCEPTED || status === ImprovementStatus.REJECTED)
    && !can(actor, "governance.audit")
  ) {
    return failure(
      "FORBIDDEN",
      "Somebody with governance oversight decides what goes on the backlog.",
    );
  }

  const data = {
    title,
    problem,
    source: input.source?.trim() || null,
    proposedSolution: input.proposedSolution?.trim() || null,
    benefit: input.benefit?.trim() || null,
    effortEstimate: input.effortEstimate?.trim() || null,
    priority: input.priority ?? ImprovementPriority.PRIORITY_THREE,
    status,
    ownerId: input.ownerId?.trim() || null,
    result,
    ...(status === ImprovementStatus.IMPLEMENTED ? { implementedAt: new Date() } : {}),
  };

  if (input.improvementId) {
    const existing = await prisma.improvementRequest.findUnique({
      where: { id: input.improvementId },
      select: { id: true },
    });

    if (!existing) {
      return failure("NOT_FOUND", "Improvement not found.");
    }

    const improvement = await prisma.improvementRequest.update({
      where: { id: existing.id },
      data,
    });

    await logActivity({
      actorId: actor.id,
      action: `Updated the improvement "${title}"`,
      entityType: "SYSTEM",
      entityId: improvement.id,
    });

    return { ok: true as const, improvement };
  }

  const improvement = await prisma.improvementRequest.create({
    data: { ...data, raisedById: actor.id },
  });

  await logActivity({
    actorId: actor.id,
    action: `Proposed an improvement: ${title}`,
    entityType: "SYSTEM",
    entityId: improvement.id,
  });

  return { ok: true as const, improvement };
}
