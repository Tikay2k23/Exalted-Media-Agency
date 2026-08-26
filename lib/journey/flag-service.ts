import { type JourneyFlagKind } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { FLAG_LABELS } from "@/lib/journey/client-detail";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Raising and clearing the temporary conditions that sit on a journey stage.
 *
 * These are deliberately not stages and not health values. An account waiting
 * on a login is still in Build; pausing over a client's holiday does not undo
 * the work already done. Recording them separately is what lets the stage stay
 * truthful while the interface still shows why nothing is moving.
 *
 * A BLOCKED flag also writes Client.currentBlocker, and clearing the last one
 * empties it again. That field is what the board's health and Needs Attention
 * already read, so keeping it in step here means the main dashboard reflects a
 * blocker raised on this page without a single change to it. One writer owns
 * that column - this module - which is what stops the two from disagreeing.
 */

export type FlagFailureCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID";

export const FLAG_FAILURE_STATUS: Record<FlagFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
};

export interface FlagFailure {
  ok: false;
  code: FlagFailureCode;
  message: string;
}

function failure(code: FlagFailureCode, message: string): FlagFailure {
  return { ok: false, code, message };
}

/** Raising or clearing a condition is delivery coordination. */
function mayManage(actor: AuthContext) {
  return can(actor, "clients.edit");
}

async function syncBlockerColumn(clientId: string) {
  const openBlocker = await prisma.clientJourneyFlag.findFirst({
    where: { clientId, kind: "BLOCKED", resolvedAt: null },
    orderBy: { raisedAt: "desc" },
    select: { reason: true },
  });

  await prisma.client.update({
    where: { id: clientId },
    data: { currentBlocker: openBlocker?.reason ?? null },
  });
}

export interface RaiseFlagInput {
  actor: AuthContext;
  clientId: string;
  kind: JourneyFlagKind;
  reason: string;
  detail?: string | null;
  responsibleParty?: string | null;
  dueAt?: Date | null;
  round?: number | null;

  /*
   * What a blocker costs, and what it hangs off.
   *
   * All optional: a waiting record has no severity to give, and a condition
   * raised before any of this existed keeps working with none of it set.
   */
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  impact?: "BLOCKS_STAGE" | "DELAYS_MILESTONE" | "NO_BLOCK" | null;
  expectedResolutionAt?: Date | null;
  requirementKey?: string | null;
  taskId?: string | null;
  contactId?: string | null;
}

export async function raiseJourneyFlag(input: RaiseFlagInput) {
  const { actor, clientId, kind } = input;

  if (!mayManage(actor)) {
    return failure("FORBIDDEN", "You do not have permission to update this account.");
  }

  const reason = input.reason.trim();

  if (reason.length < 3) {
    return failure("INVALID", "Say what the reason is, so somebody else can act on it.");
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { id: true, companyName: true },
  });

  if (!client) return failure("NOT_FOUND", "That client could not be found.");

  const flag = await prisma.clientJourneyFlag.create({
    data: {
      clientId,
      kind,
      reason,
      detail: input.detail?.trim() || null,
      responsibleParty: input.responsibleParty?.trim() || null,
      dueAt: input.dueAt ?? null,
      round: input.round ?? null,
      severity: input.severity ?? null,
      impact: input.impact ?? null,
      expectedResolutionAt: input.expectedResolutionAt ?? null,
      requirementKey: input.requirementKey?.trim() || null,
      taskId: input.taskId ?? null,
      contactId: input.contactId ?? null,
      raisedById: actor.id,
    },
    select: { id: true },
  });

  if (kind === "BLOCKED") {
    await syncBlockerColumn(clientId);
  }

  await logActivity({
    actorId: actor.id,
    action: `${client.companyName} marked ${FLAG_LABELS[kind]}: ${reason}`,
    entityType: "CLIENT",
    entityId: clientId,
    fieldName: "journeyFlag",
    newValue: kind,
    metadataJson: {
      flagId: flag.id,
      responsibleParty: input.responsibleParty ?? null,
      dueAt: input.dueAt?.toISOString() ?? null,
      round: input.round ?? null,
    },
  });

  return { ok: true as const, flagId: flag.id };
}

export interface ResolveFlagInput {
  actor: AuthContext;
  flagId: string;
  note?: string | null;
}

export async function resolveJourneyFlag(input: ResolveFlagInput) {
  const { actor, flagId } = input;

  if (!mayManage(actor)) {
    return failure("FORBIDDEN", "You do not have permission to update this account.");
  }

  const flag = await prisma.clientJourneyFlag.findUnique({
    where: { id: flagId },
    select: {
      id: true,
      kind: true,
      reason: true,
      resolvedAt: true,
      clientId: true,
      client: { select: { companyName: true } },
    },
  });

  if (!flag) return failure("NOT_FOUND", "That condition could not be found.");

  // Already cleared. Returning success rather than an error: a second click
  // and a stale tab both land here, and neither did anything wrong.
  if (flag.resolvedAt) {
    return { ok: true as const, flagId: flag.id, alreadyResolved: true };
  }

  await prisma.clientJourneyFlag.update({
    where: { id: flagId },
    data: {
      resolvedAt: new Date(),
      resolvedById: actor.id,
      resolutionNote: input.note?.trim() || null,
    },
  });

  if (flag.kind === "BLOCKED") {
    await syncBlockerColumn(flag.clientId);
  }

  await logActivity({
    actorId: actor.id,
    action: `${flag.client.companyName} cleared ${FLAG_LABELS[flag.kind]}: ${flag.reason}`,
    entityType: "CLIENT",
    entityId: flag.clientId,
    fieldName: "journeyFlag",
    previousValue: flag.kind,
    newValue: null,
    metadataJson: { flagId: flag.id, note: input.note ?? null },
  });

  return { ok: true as const, flagId: flag.id, alreadyResolved: false };
}

/**
 * Recording that somebody chased a client dependency.
 *
 * Deliberately not a send. Nothing in this application sends email or SMS -
 * client-facing communication is an explicit human action here - so this
 * records that the chase happened and when, which is what makes the age of a
 * request mean something and stops the same item being asked for twice in a
 * morning.
 */
export async function recordFollowUp(input: {
  actor: AuthContext;
  flagId: string;
  note?: string | null;
}) {
  const { actor, flagId } = input;

  const flag = await prisma.clientJourneyFlag.findUnique({
    where: { id: flagId },
    select: {
      id: true,
      clientId: true,
      reason: true,
      resolvedAt: true,
      cancelledAt: true,
      lastFollowUpAt: true,
      followUpCount: true,
      client: { select: { companyName: true, assignedUserId: true } },
    },
  });

  if (!flag) return failure("NOT_FOUND", "That record no longer exists.");

  if (!mayManage(actor)) {
    return failure("FORBIDDEN", "You do not have permission to update this account.");
  }

  if (flag.resolvedAt || flag.cancelledAt) {
    return failure("INVALID", "That request is already closed.");
  }

  /*
   * Once a day at most, checked here rather than only in the interface: the
   * point is that a client is not chased four times for one thing, and a
   * double-click must not count as two chases.
   */
  if (flag.lastFollowUpAt) {
    const since = Date.now() - flag.lastFollowUpAt.getTime();

    if (since < 86_400_000) {
      return failure("INVALID", "This was already followed up today.");
    }
  }

  const now = new Date();

  const updated = await prisma.clientJourneyFlag.update({
    where: { id: flag.id },
    data: {
      lastFollowUpAt: now,
      followUpCount: { increment: 1 },
    },
    select: { id: true, followUpCount: true, lastFollowUpAt: true },
  });

  await logActivity({
    actorId: actor.id,
    action: `Followed up with ${flag.client.companyName} on: ${flag.reason}`,
    entityType: "CLIENT",
    entityId: flag.clientId,
    metadataJson: { flagId: flag.id, followUpCount: updated.followUpCount },
  });

  return { ok: true as const, flag: updated };
}

/**
 * The client answered.
 *
 * Separate from resolving: received is their move and resolved is ours, and an
 * account sitting on an answer nobody has checked should not read as finished.
 */
export async function markDependencyReceived(input: {
  actor: AuthContext;
  flagId: string;
}) {
  const { actor, flagId } = input;

  const flag = await prisma.clientJourneyFlag.findUnique({
    where: { id: flagId },
    select: {
      id: true,
      clientId: true,
      reason: true,
      resolvedAt: true,
      cancelledAt: true,
      receivedAt: true,
    },
  });

  if (!flag) return failure("NOT_FOUND", "That record no longer exists.");

  if (!mayManage(actor)) {
    return failure("FORBIDDEN", "You do not have permission to update this account.");
  }

  if (flag.resolvedAt || flag.cancelledAt) {
    return failure("INVALID", "That request is already closed.");
  }

  if (flag.receivedAt) {
    return failure("INVALID", "This information has already been marked received.");
  }

  /*
   * Conditional on it still being unreceived.
   *
   * Two people can have this open at once, and the read above is not the
   * write. Without the condition the second click silently moves the received
   * date to now, quietly rewriting when the client actually answered - which
   * is the one thing this timestamp exists to record.
   */
  const claimed = await prisma.clientJourneyFlag.updateMany({
    where: { id: flag.id, receivedAt: null, resolvedAt: null, cancelledAt: null },
    data: { receivedAt: new Date() },
  });

  if (claimed.count === 0) {
    return failure("INVALID", "This information has already been marked received.");
  }

  const updated = await prisma.clientJourneyFlag.findUniqueOrThrow({
    where: { id: flag.id },
    select: { id: true, receivedAt: true },
  });

  await logActivity({
    actorId: actor.id,
    action: `Recorded a client response for: ${flag.reason}`,
    entityType: "CLIENT",
    entityId: flag.clientId,
    metadataJson: { flagId: flag.id },
  });

  return { ok: true as const, flag: updated };
}
