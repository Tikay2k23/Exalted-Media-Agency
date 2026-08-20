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
