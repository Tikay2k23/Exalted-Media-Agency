import {
  ComplaintStatus,
  HealthStatus,
  RecoveryPlanStatus,
} from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Client health, complaints, and recovery plans.
 *
 * Health used to be a dropdown on the account form. Anybody could set an
 * account to green without saying why, and nothing recorded who decided or
 * when. That is the same failure the approval register was built to stop: a
 * status nobody can check afterwards.
 *
 * So health is no longer something you set. It is something you assess: the
 * assessment is the record, the field on the client is its snapshot, and the
 * stage gate re-derives from the assessment rather than trusting the field.
 *
 * A red account also has to have a recovery plan. Marking a client as at risk
 * of leaving and then doing nothing is worse than not noticing, because it
 * looks like it was handled.
 */

export type HealthFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "RECOVERY_PLAN_REQUIRED";

export interface HealthFailure {
  ok: false;
  code: HealthFailureCode;
  message: string;
}

function failure(code: HealthFailureCode, message: string): HealthFailure {
  return { ok: false, code, message };
}

export const HEALTH_FAILURE_STATUS: Record<HealthFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  RECOVERY_PLAN_REQUIRED: 409,
};

/** The statuses that mean somebody has actually looked. */
const ASSESSED: readonly HealthStatus[] = [
  HealthStatus.GREEN,
  HealthStatus.YELLOW,
  HealthStatus.RED,
];

/** Statuses that need a plan attached, not just a colour. */
const NEEDS_PLAN: readonly HealthStatus[] = [HealthStatus.RED];

const OPEN_COMPLAINT_STATUSES: readonly ComplaintStatus[] = [
  ComplaintStatus.LOGGED,
  ComplaintStatus.INVESTIGATING,
  ComplaintStatus.ACTION_AGREED,
  ComplaintStatus.ESCALATED,
];

const LIVE_PLAN_STATUSES: readonly RecoveryPlanStatus[] = [
  RecoveryPlanStatus.DRAFT,
  RecoveryPlanStatus.ACTIVE,
  RecoveryPlanStatus.MONITORING,
];

export function isComplaintOpen(status: ComplaintStatus) {
  return OPEN_COMPLAINT_STATUSES.includes(status);
}

export function isRecoveryPlanLive(status: RecoveryPlanStatus) {
  return LIVE_PLAN_STATUSES.includes(status);
}

export interface AssessableClient {
  healthStatus: HealthStatus;
  healthAssessments: { status: HealthStatus }[];
}

/**
 * Whether the account has a health assessment a stage gate can rely on.
 *
 * Pure, and shared by the gate and the screen so the two cannot disagree.
 * The field alone is not enough: it can be left over from a migration or an
 * earlier version of this screen, with nobody's name against it.
 */
export function hasCurrentHealthAssessment(client: AssessableClient) {
  if (!ASSESSED.includes(client.healthStatus)) {
    return false;
  }

  return client.healthAssessments.length > 0;
}

/** Age of the newest assessment in days, or null when there is none. */
export function daysSinceAssessment(assessedAt: Date | null, now = new Date()) {
  if (!assessedAt) {
    return null;
  }

  return Math.floor((now.getTime() - assessedAt.getTime()) / 86_400_000);
}

async function loadClient(actor: AuthContext, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: {
      id: true,
      companyName: true,
      assignedUserId: true,
      healthStatus: true,
    },
  });
}

/** Everyone who needs to hear that an account is in trouble. */
async function leadershipRecipients() {
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

export interface RecordAssessmentInput {
  actor: AuthContext;
  clientId: string;
  status: HealthStatus;
  summary: string;
  healthScore?: number | null;
  satisfactionScore?: number | null;
  renewalProbability?: number | null;
  cancellationThreat?: boolean;
  communicationStatus?: string | null;
  paymentStatus?: string | null;
  performanceStatus?: string | null;
  clientParticipation?: string | null;
}

/**
 * Records a health assessment and moves the client's status to match.
 *
 * The summary is required. A colour with no reasoning cannot be argued with,
 * acted on, or reviewed later - which is the whole point of assessing.
 */
export async function recordHealthAssessment(input: RecordAssessmentInput) {
  const { actor, clientId, status } = input;

  if (!can(actor, "health.manage")) {
    return failure("FORBIDDEN", "You do not have permission to assess client health.");
  }

  if (!ASSESSED.includes(status)) {
    return failure(
      "INVALID",
      "Choose green, yellow or red. 'Not assessed' is what an account looks like before anybody has decided.",
    );
  }

  const summary = input.summary.trim();

  if (summary.length < 10) {
    return failure(
      "INVALID",
      "Say why the account is this colour. A colour on its own cannot be acted on or reviewed later.",
    );
  }

  for (const [label, value] of [
    ["Health score", input.healthScore],
    ["Satisfaction score", input.satisfactionScore],
    ["Renewal probability", input.renewalProbability],
  ] as const) {
    if (value !== null && value !== undefined && (value < 0 || value > 100)) {
      return failure("INVALID", `${label} must be between 0 and 100.`);
    }
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  // A red account without a plan is a note to nobody. Yellow is a warning and
  // does not carry the same obligation.
  if (NEEDS_PLAN.includes(status)) {
    const livePlan = await prisma.recoveryPlan.findFirst({
      where: { clientId: client.id, status: { in: [...LIVE_PLAN_STATUSES] } },
      select: { id: true },
    });

    if (!livePlan) {
      return failure(
        "RECOVERY_PLAN_REQUIRED",
        "A red account needs a recovery plan. Write the plan first, then set the status - otherwise this reads as handled when nothing is happening.",
      );
    }
  }

  const openComplaints = await prisma.complaint.count({
    where: { clientId: client.id, status: { in: [...OPEN_COMPLAINT_STATUSES] } },
  });

  const previousStatus = client.healthStatus;

  const [assessment] = await prisma.$transaction([
    prisma.clientHealthAssessment.create({
      data: {
        clientId: client.id,
        status,
        summary,
        healthScore: input.healthScore ?? null,
        satisfactionScore: input.satisfactionScore ?? null,
        renewalProbability: input.renewalProbability ?? null,
        cancellationThreat: input.cancellationThreat ?? false,
        communicationStatus: input.communicationStatus?.trim() || null,
        paymentStatus: input.paymentStatus?.trim() || null,
        performanceStatus: input.performanceStatus?.trim() || null,
        clientParticipation: input.clientParticipation?.trim() || null,
        // Counted rather than typed, so it cannot drift from the register.
        openComplaints,
        assessedById: actor.id,
      },
    }),
    prisma.client.update({
      where: { id: client.id },
      data: { healthStatus: status },
    }),
  ]);

  await logActivity({
    actorId: actor.id,
    action: `Assessed ${client.companyName} as ${status.toLowerCase()}`,
    entityType: "CLIENT",
    entityId: client.id,
    fieldName: "healthStatus",
    previousValue: previousStatus,
    newValue: status,
    metadataJson: { assessmentId: assessment.id, summary },
  });

  // Leadership hears about a decline, not about every routine green.
  const declined =
    (status === HealthStatus.YELLOW && previousStatus !== HealthStatus.RED)
    || status === HealthStatus.RED;

  if (declined && status !== previousStatus) {
    await createNotifications(
      resolveRecipients(
        [...(await leadershipRecipients()), client.assignedUserId],
        actor.id,
      ).map((recipientId) => ({
        recipientId,
        type: "CLIENT_HEALTH_CHANGE" as const,
        urgency: status === HealthStatus.RED ? ("CRITICAL" as const) : ("HIGH" as const),
        title: `${client.companyName} is now ${status.toLowerCase()}`,
        body: summary,
        entityType: "CLIENT" as const,
        entityId: client.id,
        href: `/clients/${client.id}`,
      })),
    );
  }

  return { ok: true as const, assessment };
}

export async function raiseComplaint(input: {
  actor: AuthContext;
  clientId: string;
  title: string;
  description: string;
  serviceArea?: string | null;
  businessImpact?: string | null;
  evidenceUrl?: string | null;
  ownerId?: string | null;
  followUpAt?: Date | null;
}) {
  const { actor, clientId } = input;

  if (!can(actor, "complaints.manage")) {
    return failure("FORBIDDEN", "You do not have permission to record complaints.");
  }

  const title = input.title.trim();
  const description = input.description.trim();

  if (title.length < 3 || description.length < 10) {
    return failure("INVALID", "A complaint needs a title and a description of what happened.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  let ownerId = input.ownerId?.trim() || null;

  if (ownerId) {
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    ownerId = owner?.id ?? null;
  }

  const complaint = await prisma.complaint.create({
    data: {
      clientId: client.id,
      title,
      description,
      serviceArea: input.serviceArea?.trim() || null,
      businessImpact: input.businessImpact?.trim() || null,
      evidenceUrl: input.evidenceUrl?.trim() || null,
      ownerId: ownerId ?? client.assignedUserId,
      followUpAt: input.followUpAt ?? null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Recorded a complaint from ${client.companyName}: "${title}"`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { complaintId: complaint.id },
  });

  await createNotifications(
    resolveRecipients(
      [...(await leadershipRecipients()), client.assignedUserId, complaint.ownerId],
      actor.id,
    ).map((recipientId) => ({
      recipientId,
      type: "CLIENT_HEALTH_CHANGE" as const,
      urgency: "HIGH" as const,
      title: `Complaint from ${client.companyName}`,
      body: title,
      entityType: "CLIENT" as const,
      entityId: client.id,
      href: `/clients/${client.id}`,
    })),
  );

  return { ok: true as const, complaint };
}

/**
 * Updates a complaint.
 *
 * Resolving one requires the outcome to be written down: what was actually
 * done. Otherwise the register fills with things marked resolved that nobody
 * can describe.
 */
export async function updateComplaint(input: {
  actor: AuthContext;
  complaintId: string;
  status?: ComplaintStatus;
  rootCause?: string | null;
  resolutionPlan?: string | null;
  clientCommunication?: string | null;
  finalOutcome?: string | null;
  ownerId?: string | null;
  followUpAt?: Date | null;
}) {
  const { actor, complaintId } = input;

  if (!can(actor, "complaints.manage")) {
    return failure("FORBIDDEN", "You do not have permission to update complaints.");
  }

  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
    select: { id: true, clientId: true, title: true, status: true, finalOutcome: true },
  });

  if (!complaint) {
    return failure("NOT_FOUND", "Complaint not found.");
  }

  const client = await loadClient(actor, complaint.clientId);

  if (!client) {
    return failure("NOT_FOUND", "Complaint not found.");
  }

  const closing =
    input.status === ComplaintStatus.RESOLVED || input.status === ComplaintStatus.CLOSED;
  const outcome = input.finalOutcome?.trim() || complaint.finalOutcome;

  if (closing && !outcome) {
    return failure(
      "INVALID",
      "Say what was actually done before closing this, or nobody will be able to tell what happened.",
    );
  }

  const updated = await prisma.complaint.update({
    where: { id: complaint.id },
    data: {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.rootCause !== undefined ? { rootCause: input.rootCause?.trim() || null } : {}),
      ...(input.resolutionPlan !== undefined
        ? { resolutionPlan: input.resolutionPlan?.trim() || null }
        : {}),
      ...(input.clientCommunication !== undefined
        ? { clientCommunication: input.clientCommunication?.trim() || null }
        : {}),
      ...(input.finalOutcome !== undefined ? { finalOutcome: outcome } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId || null } : {}),
      ...(input.followUpAt !== undefined ? { followUpAt: input.followUpAt } : {}),
      ...(closing ? { resolvedAt: new Date() } : {}),
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Updated the complaint "${complaint.title}" for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    ...(input.status && input.status !== complaint.status
      ? {
          fieldName: "complaintStatus",
          previousValue: complaint.status,
          newValue: input.status,
        }
      : {}),
    metadataJson: { complaintId: complaint.id },
  });

  return { ok: true as const, complaint: updated };
}

export async function saveRecoveryPlan(input: {
  actor: AuthContext;
  clientId: string;
  planId?: string | null;
  trigger: string;
  objective: string;
  actions: string;
  status?: RecoveryPlanStatus;
  ownerId?: string | null;
  reviewDate?: Date | null;
  outcome?: string | null;
}) {
  const { actor, clientId } = input;

  if (!can(actor, "health.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage recovery plans.");
  }

  const trigger = input.trigger.trim();
  const objective = input.objective.trim();
  const actions = input.actions.trim();

  if (!trigger || !objective || !actions) {
    return failure(
      "INVALID",
      "A recovery plan needs what went wrong, what good looks like, and what you are going to do.",
    );
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const closing =
    input.status === RecoveryPlanStatus.SUCCEEDED
    || input.status === RecoveryPlanStatus.FAILED
    || input.status === RecoveryPlanStatus.CANCELLED;

  if (closing && !input.outcome?.trim()) {
    return failure(
      "INVALID",
      "Record what happened before closing a recovery plan. That is the part worth keeping.",
    );
  }

  const data = {
    trigger,
    objective,
    actions,
    status: input.status ?? RecoveryPlanStatus.ACTIVE,
    ownerId: input.ownerId?.trim() || client.assignedUserId,
    reviewDate: input.reviewDate ?? null,
    outcome: input.outcome?.trim() || null,
    ...(closing ? { completedAt: new Date() } : {}),
  };

  if (input.planId) {
    const existing = await prisma.recoveryPlan.findFirst({
      where: { id: input.planId, clientId: client.id },
      select: { id: true },
    });

    if (!existing) {
      return failure("NOT_FOUND", "Recovery plan not found.");
    }

    const plan = await prisma.recoveryPlan.update({ where: { id: existing.id }, data });

    await logActivity({
      actorId: actor.id,
      action: `Updated the recovery plan for ${client.companyName}`,
      entityType: "CLIENT",
      entityId: client.id,
      metadataJson: { recoveryPlanId: plan.id, status: plan.status },
    });

    return { ok: true as const, plan };
  }

  const plan = await prisma.recoveryPlan.create({
    data: { ...data, clientId: client.id, startDate: new Date() },
  });

  await logActivity({
    actorId: actor.id,
    action: `Started a recovery plan for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { recoveryPlanId: plan.id },
  });

  await createNotifications(
    resolveRecipients([...(await leadershipRecipients())], actor.id).map((recipientId) => ({
      recipientId,
      type: "CLIENT_HEALTH_CHANGE" as const,
      urgency: "HIGH" as const,
      title: `Recovery plan started: ${client.companyName}`,
      body: objective,
      entityType: "CLIENT" as const,
      entityId: client.id,
      href: `/clients/${client.id}`,
    })),
  );

  return { ok: true as const, plan };
}
