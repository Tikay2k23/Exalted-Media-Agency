import { BriefStatus, type Prisma } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * The strategy brief.
 *
 * Production is gated on an approved brief, so this module has to answer two
 * questions honestly: is the brief actually filled in, and did somebody other
 * than its author agree with it. An empty brief that somebody clicked approve
 * on would satisfy the gate while meaning nothing.
 */

export type BriefFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INCOMPLETE"
  | "SELF_APPROVAL"
  | "INVALID";

export interface BriefFailure {
  ok: false;
  code: BriefFailureCode;
  message: string;
  missing?: string[];
}

function failure(code: BriefFailureCode, message: string, missing?: string[]): BriefFailure {
  return { ok: false, code, message, missing };
}

/**
 * The questions a brief has to answer before anyone can be asked to approve it.
 *
 * Deliberately short. These are the ones a specialist cannot start work without,
 * not everything the form collects.
 */
export const REQUIRED_BRIEF_FIELDS = [
  { key: "primaryGoal", label: "Primary business goal" },
  { key: "successMetrics", label: "How success will be measured" },
  { key: "targetAudience", label: "Target audience" },
  { key: "mainOffer", label: "The offer" },
  { key: "agencyResponsibilities", label: "What the agency will do" },
  { key: "clientResponsibilities", label: "What the client must do" },
] as const;

export interface CompletableBrief {
  [key: string]: unknown;
}

export interface BriefCompleteness {
  complete: boolean;
  missing: string[];
  answered: number;
  total: number;
}

/** Reports which required questions are still unanswered. */
export function deriveBriefCompleteness(brief: CompletableBrief | null): BriefCompleteness {
  if (!brief) {
    return {
      complete: false,
      missing: REQUIRED_BRIEF_FIELDS.map((field) => field.label),
      answered: 0,
      total: REQUIRED_BRIEF_FIELDS.length,
    };
  }

  const missing = REQUIRED_BRIEF_FIELDS.filter((field) => {
    const value = brief[field.key];
    return typeof value !== "string" || value.trim().length === 0;
  }).map((field) => field.label);

  return {
    complete: missing.length === 0,
    missing,
    answered: REQUIRED_BRIEF_FIELDS.length - missing.length,
    total: REQUIRED_BRIEF_FIELDS.length,
  };
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

export type BriefFields = Record<string, string | null | undefined>;

/**
 * Creates or updates the brief. One brief per account, so this is an upsert.
 *
 * Editing an approved brief sends it back to Needs revision: production is
 * gated on the approval, and quietly changing the plan underneath it would
 * make that approval meaningless.
 */
export async function saveBrief(input: {
  actor: AuthContext;
  clientId: string;
  data: BriefFields;
}) {
  const { actor, clientId, data } = input;

  if (!can(actor, "projects.manage")) {
    return failure("FORBIDDEN", "You do not have permission to edit the strategy brief.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const existing = await prisma.strategyBrief.findUnique({
    where: { clientId: client.id },
    select: { id: true, status: true },
  });

  // Only the answer fields, normalised so an emptied box becomes null rather
  // than an empty string the completeness check would have to special-case.
  const fields: Record<string, string | null> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields[key] = value || null;
    }
  }

  const wasApproved = existing?.status === BriefStatus.APPROVED;

  const brief = await prisma.strategyBrief.upsert({
    where: { clientId: client.id },
    update: {
      ...fields,
      ...(wasApproved
        ? { status: BriefStatus.NEEDS_REVISION, approvedById: null, approvedAt: null }
        : {}),
    } satisfies Prisma.StrategyBriefUncheckedUpdateInput,
    create: {
      ...fields,
      clientId: client.id,
      authorId: actor.id,
      status: BriefStatus.DRAFT,
    } satisfies Prisma.StrategyBriefUncheckedCreateInput,
  });

  await logActivity({
    actorId: actor.id,
    action: wasApproved
      ? `Edited the approved strategy brief for ${client.companyName}, which returned it for revision`
      : `Updated the strategy brief for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    ...(wasApproved
      ? { fieldName: "briefStatus", previousValue: BriefStatus.APPROVED, newValue: brief.status }
      : {}),
  });

  return { ok: true as const, brief, returnedForRevision: wasApproved };
}

export async function submitBriefForReview(input: {
  actor: AuthContext;
  clientId: string;
}) {
  const { actor, clientId } = input;

  if (!can(actor, "projects.manage")) {
    return failure("FORBIDDEN", "You do not have permission to submit the brief.");
  }

  const brief = await prisma.strategyBrief.findUnique({
    where: { clientId },
    include: { client: { select: { id: true, companyName: true } } },
  });

  if (!brief) {
    return failure("NOT_FOUND", "No strategy brief exists for this account yet.");
  }

  const completeness = deriveBriefCompleteness(brief as unknown as CompletableBrief);

  if (!completeness.complete) {
    return failure(
      "INCOMPLETE",
      "The brief is missing answers somebody needs before they can approve it.",
      completeness.missing,
    );
  }

  const updated = await prisma.strategyBrief.update({
    where: { clientId },
    data: { status: BriefStatus.IN_REVIEW },
  });

  await logActivity({
    actorId: actor.id,
    action: `Submitted the strategy brief for ${brief.client.companyName} for approval`,
    entityType: "CLIENT",
    entityId: brief.client.id,
    fieldName: "briefStatus",
    previousValue: brief.status,
    newValue: updated.status,
  });

  // Whoever can approve needs to know it is waiting, and it will not be the
  // author.
  const approvers = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      teamRole: { in: ["AGENCY_OWNER", "PROJECT_MANAGER"] },
    },
    select: { id: true },
  });

  await createNotifications(
    resolveRecipients(
      approvers.map((user) => user.id).filter((id) => id !== brief.authorId),
      actor.id,
    ).map((recipientId) => ({
      recipientId,
      type: "APPROVAL_RECEIVED" as const,
      urgency: "HIGH" as const,
      title: `Strategy brief awaiting approval: ${brief.client.companyName}`,
      body: "Production cannot start until this is approved.",
      entityType: "CLIENT" as const,
      entityId: brief.client.id,
      href: `/clients/${brief.client.id}`,
    })),
  );

  return { ok: true as const, brief: updated };
}

/**
 * Approves the brief.
 *
 * The author cannot approve their own, for the same reason a builder cannot
 * close their own defect: a plan nobody else agreed to is not an agreement. In
 * a six-person agency this usually means the owner signs off the project
 * manager's brief.
 */
export async function approveBrief(input: { actor: AuthContext; clientId: string }) {
  const { actor, clientId } = input;

  if (!can(actor, "projects.manage")) {
    return failure("FORBIDDEN", "You do not have permission to approve the brief.");
  }

  const brief = await prisma.strategyBrief.findUnique({
    where: { clientId },
    include: { client: { select: { id: true, companyName: true, assignedUserId: true } } },
  });

  if (!brief) {
    return failure("NOT_FOUND", "No strategy brief exists for this account yet.");
  }

  if (brief.status === BriefStatus.APPROVED) {
    return failure("INVALID", "This brief is already approved.");
  }

  if (brief.authorId && brief.authorId === actor.id) {
    return failure(
      "SELF_APPROVAL",
      "You wrote this brief, so somebody else has to approve it.",
    );
  }

  const completeness = deriveBriefCompleteness(brief as unknown as CompletableBrief);

  if (!completeness.complete) {
    return failure(
      "INCOMPLETE",
      "This brief cannot be approved while required answers are missing.",
      completeness.missing,
    );
  }

  const approved = await prisma.strategyBrief.update({
    where: { clientId },
    data: {
      status: BriefStatus.APPROVED,
      approvedById: actor.id,
      approvedAt: new Date(),
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Approved the strategy brief for ${brief.client.companyName}`,
    entityType: "CLIENT",
    entityId: brief.client.id,
    fieldName: "briefStatus",
    previousValue: brief.status,
    newValue: approved.status,
  });

  await createNotifications(
    resolveRecipients([brief.authorId, brief.client.assignedUserId], actor.id).map(
      (recipientId) => ({
        recipientId,
        type: "APPROVAL_RECEIVED" as const,
        urgency: "NORMAL" as const,
        title: `Strategy approved for ${brief.client.companyName}`,
        body: `${actor.name} approved the brief. Production can start.`,
        entityType: "CLIENT" as const,
        entityId: brief.client.id,
        href: `/clients/${brief.client.id}`,
      }),
    ),
  );

  return { ok: true as const, brief: approved };
}

export async function requestBriefRevision(input: {
  actor: AuthContext;
  clientId: string;
  reason: string;
}) {
  const { actor, clientId, reason } = input;

  if (!can(actor, "projects.manage")) {
    return failure("FORBIDDEN", "You do not have permission to review the brief.");
  }

  if (!reason.trim()) {
    return failure("INVALID", "Say what needs changing, or the author cannot act on it.");
  }

  const brief = await prisma.strategyBrief.findUnique({
    where: { clientId },
    include: { client: { select: { id: true, companyName: true } } },
  });

  if (!brief) {
    return failure("NOT_FOUND", "No strategy brief exists for this account yet.");
  }

  const updated = await prisma.strategyBrief.update({
    where: { clientId },
    data: { status: BriefStatus.NEEDS_REVISION, approvedById: null, approvedAt: null },
  });

  await logActivity({
    actorId: actor.id,
    action: `Sent the strategy brief for ${brief.client.companyName} back for revision`,
    entityType: "CLIENT",
    entityId: brief.client.id,
    fieldName: "briefStatus",
    previousValue: brief.status,
    newValue: updated.status,
    metadataJson: { reason: reason.trim() },
  });

  await createNotifications(
    resolveRecipients([brief.authorId], actor.id).map((recipientId) => ({
      recipientId,
      type: "REVISION_REQUEST" as const,
      urgency: "HIGH" as const,
      title: `Strategy brief needs changes: ${brief.client.companyName}`,
      body: reason.trim(),
      entityType: "CLIENT" as const,
      entityId: brief.client.id,
      href: `/clients/${brief.client.id}`,
    })),
  );

  return { ok: true as const, brief: updated };
}
