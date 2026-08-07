import { ApprovalRecordStatus, ApprovalType } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * The client approval register.
 *
 * Every other approval in this system is one teammate agreeing with another,
 * so the integrity rule is that they cannot be the same person. This one is
 * different: the client approves, but an agency person types it in. Nobody
 * outside the agency ever touches the record.
 *
 * So the question this module has to answer is not "did two people agree" but
 * "could this be checked afterwards". A sign-off that names nobody and points
 * at nothing is one person's memory, and a launch resting on it is exactly the
 * exposure the requirement exists to prevent. Hence: a named approver who is
 * an authorized contact on the account, and evidence - a link, or a written
 * account of how the approval was captured.
 */

export type ApprovalFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "NO_APPROVER"
  | "ALREADY_WITHDRAWN";

export interface ApprovalFailure {
  ok: false;
  code: ApprovalFailureCode;
  message: string;
}

function failure(code: ApprovalFailureCode, message: string): ApprovalFailure {
  return { ok: false, code, message };
}

/** Kept beside the codes so both endpoints answer the same way. */
export const APPROVAL_FAILURE_STATUS: Record<ApprovalFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  /** Well formed, but the account is not set up for it yet. */
  NO_APPROVER: 409,
  ALREADY_WITHDRAWN: 409,
};

/**
 * The approval types this screen records.
 *
 * STRATEGY_BRIEF is deliberately absent: that approval is internal and lives
 * on the brief itself, and offering it here would invite somebody to record a
 * client sign-off that never happened.
 */
export const CLIENT_APPROVAL_TYPES = [
  { value: ApprovalType.DELIVERABLE, label: "Deliverable" },
  { value: ApprovalType.FINAL_SIGN_OFF, label: "Final sign-off" },
  { value: ApprovalType.SCOPE_CHANGE, label: "Scope change" },
  { value: ApprovalType.LAUNCH, label: "Launch" },
] as const;

/** The types that let an account move to Ready for launch. */
const GATE_SATISFYING_TYPES: readonly ApprovalType[] = [
  ApprovalType.DELIVERABLE,
  ApprovalType.FINAL_SIGN_OFF,
];

export interface VerifiableApproval {
  type: ApprovalType;
  status: ApprovalRecordStatus;
  approvedByName: string | null;
  evidenceUrl: string | null;
  notes: string | null;
}

function hasText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Whether a stored approval is one a launch may rest on.
 *
 * Pure, and used by both the stage gate and the screen, so what the gate
 * enforces and what the screen shows can never disagree.
 */
export function isVerifiableApproval(approval: VerifiableApproval) {
  return (
    approval.status === ApprovalRecordStatus.RECORDED
    && hasText(approval.approvedByName)
    && (hasText(approval.evidenceUrl) || hasText(approval.notes))
  );
}

/** Why a given approval does not satisfy the gate. Empty means it does. */
export function describeApprovalShortfall(approval: VerifiableApproval): string[] {
  const reasons: string[] = [];

  if (approval.status === ApprovalRecordStatus.WITHDRAWN) {
    reasons.push("it was withdrawn");
  }
  if (!hasText(approval.approvedByName)) {
    reasons.push("nobody is named as the approver");
  }
  if (!hasText(approval.evidenceUrl) && !hasText(approval.notes)) {
    reasons.push("there is no evidence on file");
  }

  return reasons;
}

/** Whether the account has an approval a launch may rest on. */
export function hasGateSatisfyingApproval(approvals: VerifiableApproval[]) {
  return approvals.some(
    (approval) =>
      GATE_SATISFYING_TYPES.includes(approval.type) && isVerifiableApproval(approval),
  );
}

async function loadClient(actor: AuthContext, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true, assignedUserId: true },
  });
}

export interface RecordApprovalInput {
  actor: AuthContext;
  clientId: string;
  type: ApprovalType;
  subject: string;
  approverContactId: string;
  approvedAt?: Date | null;
  evidenceUrl?: string | null;
  notes?: string | null;
  projectId?: string | null;
}

/**
 * Records a client sign-off.
 *
 * The approver is chosen from the contacts on the account rather than typed,
 * and must be one marked as authorized to approve. Typing a name would make
 * the authorized-approver requirement decorative: anybody could satisfy a
 * launch gate with a name they invented.
 */
export async function recordApproval(input: RecordApprovalInput) {
  const { actor, clientId, type, approverContactId } = input;

  if (!can(actor, "revisions.recordApproval")) {
    return failure("FORBIDDEN", "You do not have permission to record client approvals.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const subject = input.subject.trim();

  if (!subject) {
    return failure("INVALID", "Say what the client approved.");
  }

  const evidenceUrl = input.evidenceUrl?.trim() || null;
  const notes = input.notes?.trim() || null;

  if (!evidenceUrl && !notes) {
    return failure(
      "INVALID",
      "Add evidence: a link to the approval, or a note describing how it was given.",
    );
  }

  const approvedAt = input.approvedAt ?? new Date();

  // An approval cannot have happened in the future. Recording one dated ahead
  // would let somebody satisfy the gate before the client has actually seen
  // the work.
  if (approvedAt.getTime() > Date.now()) {
    return failure("INVALID", "The approval date cannot be in the future.");
  }

  const contact = await prisma.clientContact.findFirst({
    where: { id: approverContactId, clientId: client.id },
    select: { id: true, name: true, isApprover: true },
  });

  if (!contact) {
    return failure("NOT_FOUND", "That contact is not on this account.");
  }

  if (!contact.isApprover) {
    return failure(
      "NO_APPROVER",
      `${contact.name} is not marked as authorized to approve for this account. Update the contact first, or pick somebody who is.`,
    );
  }

  let projectId: string | null = input.projectId?.trim() || null;

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, clientId: client.id, deletedAt: null },
      select: { id: true },
    });

    // A stale project reference should not cost the agency the approval
    // record itself, so it is dropped rather than rejected.
    projectId = project?.id ?? null;
  }

  const approval = await prisma.approval.create({
    data: {
      clientId: client.id,
      projectId,
      type,
      subject,
      approverContactId: contact.id,
      // Snapshot, so the record still names somebody if the contact is
      // removed later.
      approvedByName: contact.name,
      evidenceUrl,
      notes,
      approvedAt,
      recordedById: actor.id,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Recorded ${contact.name}'s approval of "${subject}" for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { approvalId: approval.id, type, approvedAt: approvedAt.toISOString() },
  });

  await createNotifications(
    resolveRecipients([client.assignedUserId], actor.id).map((recipientId) => ({
      recipientId,
      type: "APPROVAL_RECEIVED" as const,
      urgency: "NORMAL" as const,
      title: `Client approval recorded: ${client.companyName}`,
      body: `${contact.name} approved "${subject}".`,
      entityType: "CLIENT" as const,
      entityId: client.id,
      href: `/clients/${client.id}`,
    })),
  );

  return { ok: true as const, approval };
}

/**
 * Withdraws an approval.
 *
 * There is no delete. A client who retracts a sign-off, or a teammate who
 * recorded the wrong one, both need the register to stop counting it - but
 * what was believed, by whom, and when, is exactly the history the register
 * exists to keep. So the row stays and the reason is required.
 */
export async function withdrawApproval(input: {
  actor: AuthContext;
  approvalId: string;
  reason: string;
}) {
  const { actor, approvalId, reason } = input;

  if (!can(actor, "revisions.recordApproval")) {
    return failure("FORBIDDEN", "You do not have permission to withdraw client approvals.");
  }

  const trimmedReason = reason.trim();

  if (trimmedReason.length < 10) {
    return failure(
      "INVALID",
      "Say why the approval no longer stands - the next person reading this will need it.",
    );
  }

  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    select: {
      id: true,
      clientId: true,
      subject: true,
      status: true,
      approvedByName: true,
      recordedById: true,
      client: { select: { id: true, companyName: true, assignedUserId: true } },
    },
  });

  if (!approval) {
    return failure("NOT_FOUND", "Approval not found.");
  }

  // Withdrawing changes what a launch gate will accept, so it is subject to
  // the same account scoping as recording.
  const client = await loadClient(actor, approval.clientId);

  if (!client) {
    return failure("NOT_FOUND", "Approval not found.");
  }

  if (approval.status === ApprovalRecordStatus.WITHDRAWN) {
    return failure("ALREADY_WITHDRAWN", "This approval has already been withdrawn.");
  }

  const withdrawn = await prisma.approval.update({
    where: { id: approval.id },
    data: {
      status: ApprovalRecordStatus.WITHDRAWN,
      withdrawnAt: new Date(),
      withdrawnById: actor.id,
      withdrawnReason: trimmedReason,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Withdrew ${approval.approvedByName ?? "the client"}'s approval of "${approval.subject}" for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    fieldName: "approvalStatus",
    previousValue: ApprovalRecordStatus.RECORDED,
    newValue: ApprovalRecordStatus.WITHDRAWN,
    metadataJson: { approvalId: approval.id, reason: trimmedReason },
  });

  // Anyone relying on this sign-off needs to know it has gone, including
  // whoever recorded it in the first place.
  await createNotifications(
    resolveRecipients([approval.client.assignedUserId, approval.recordedById], actor.id).map(
      (recipientId) => ({
        recipientId,
        type: "REVISION_REQUEST" as const,
        urgency: "HIGH" as const,
        title: `Client approval withdrawn: ${client.companyName}`,
        body: `"${approval.subject}" is no longer approved. ${trimmedReason}`,
        entityType: "CLIENT" as const,
        entityId: client.id,
        href: `/clients/${client.id}`,
      }),
    ),
  );

  return { ok: true as const, approval: withdrawn };
}
