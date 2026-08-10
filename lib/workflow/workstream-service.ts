import type { ServiceType, TeamRole } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { deriveOwnership, primaryOwnerRole } from "@/lib/workflow/handoff-engine";
import { rolesForService } from "@/lib/workflow/service-blueprints";

/**
 * Creating and moving a client's role workstreams, and recording handoffs.
 *
 * Everything here is idempotent by design. Stage moves, blueprint changes and
 * re-runs of the same automation all pass through these functions, and a
 * workstream that quietly duplicated would put the same client on a specialist's
 * board twice.
 */

/**
 * Ensures the client has exactly the workstreams its service calls for.
 *
 * Extra streams from a previous service are marked NOT_REQUIRED rather than
 * deleted: the work somebody already did on them is real, and deleting the row
 * would take its history with it.
 */
export async function syncWorkstreams(input: {
  clientId: string;
  service: ServiceType;
  /** Who to put in each seat, where known. */
  owners?: Partial<Record<TeamRole, string | null>>;
}) {
  const { clientId, service, owners = {} } = input;

  const required = rolesForService(service);
  const existing = await prisma.clientWorkstream.findMany({
    where: { clientId },
    select: { id: true, role: true, stage: true, ownerId: true },
  });

  const byRole = new Map(existing.map((row) => [row.role, row]));
  const operations = [];

  for (const role of required) {
    const current = byRole.get(role);
    const owner = owners[role] ?? current?.ownerId ?? null;

    if (!current) {
      operations.push(
        prisma.clientWorkstream.create({
          data: { clientId, role, ownerId: owner, isRequired: true },
        }),
      );
      continue;
    }

    // Bringing a previously-retired stream back is a legitimate move when the
    // client buys the service again.
    if (current.stage === "NOT_REQUIRED" || current.ownerId !== owner) {
      operations.push(
        prisma.clientWorkstream.update({
          where: { id: current.id },
          data: {
            ownerId: owner,
            isRequired: true,
            ...(current.stage === "NOT_REQUIRED" ? { stage: "ASSIGNED" as const } : {}),
          },
        }),
      );
    }
  }

  for (const row of existing) {
    if (!required.includes(row.role) && row.stage !== "NOT_REQUIRED") {
      operations.push(
        prisma.clientWorkstream.update({
          where: { id: row.id },
          data: { isRequired: false, stage: "NOT_REQUIRED" },
        }),
      );
    }
  }

  if (operations.length) {
    await prisma.$transaction(operations);
  }

  return prisma.clientWorkstream.findMany({
    where: { clientId },
    orderBy: { role: "asc" },
    include: { owner: { select: { id: true, name: true } } },
  });
}

/** Who holds each specialist seat, for routing generated work. */
export async function workstreamOwners(clientId: string) {
  const streams = await prisma.clientWorkstream.findMany({
    where: { clientId, isRequired: true },
    select: { role: true, ownerId: true },
  });

  const owners: Partial<Record<TeamRole, string | null>> = {};

  for (const stream of streams) {
    owners[stream.role] = stream.ownerId;
  }

  return owners;
}

/**
 * Records that the client has moved from one seat to another.
 *
 * Called by the stage transition rather than by hand, so the timeline is
 * written by the thing that actually happened rather than by somebody
 * remembering to log it.
 *
 * Returns null when ownership did not change - moving between two stages the
 * project manager holds is not a handoff, and recording it as one would bury
 * the real ones.
 */
export async function recordHandoff(input: {
  clientId: string;
  companyName: string;
  service: ServiceType;
  /** Null for a stage with no stable key - those are not journey stages. */
  toStageKey: string | null;
  actorId: string;
  fromRole: TeamRole | null;
  fromUserId: string | null;
  note?: string | null;
}) {
  const { clientId, companyName, service, toStageKey, actorId } = input;

  if (!toStageKey) {
    return null;
  }

  const toRole = primaryOwnerRole(toStageKey, service);

  if (!toRole) {
    // End of the journey. Clear the holder rather than leaving the account on
    // somebody's list forever.
    await prisma.client.update({
      where: { id: clientId },
      data: { currentOwnerRole: null, currentOwnerId: null },
    });

    return null;
  }

  if (toRole === input.fromRole) {
    return null;
  }

  const toUserId = await resolveSeatHolder(clientId, toRole);

  const handoff = await prisma.clientHandoff.create({
    data: {
      clientId,
      fromRole: input.fromRole,
      toRole,
      fromUserId: input.fromUserId,
      toUserId,
      stageKey: toStageKey,
      note: input.note?.trim() || null,
      handedOffById: actorId,
    },
  });

  await prisma.client.update({
    where: { id: clientId },
    data: { currentOwnerRole: toRole, currentOwnerId: toUserId },
  });

  const { next } = deriveOwnership(toStageKey, service);

  await logActivity({
    actorId,
    action: `${companyName} handed to ${toRole.toLowerCase().replaceAll("_", " ")}`,
    entityType: "CLIENT",
    entityId: clientId,
    fieldName: "currentOwnerRole",
    previousValue: input.fromRole,
    newValue: toRole,
    metadataJson: { handoffId: handoff.id, stageKey: toStageKey, nextRoles: next },
  });

  await createNotifications(
    resolveRecipients([toUserId], actorId).map((recipientId) => ({
      recipientId,
      type: "TASK_ASSIGNED" as const,
      urgency: "HIGH" as const,
      title: `${companyName} is now yours`,
      body: `Handed over at ${toStageKey.replaceAll("_", " ")}. Your tasks are on the account.`,
      entityType: "CLIENT" as const,
      entityId: clientId,
      href: `/clients/${clientId}`,
    })),
  );

  return handoff;
}

/**
 * Who actually sits in a seat for this client.
 *
 * Prefers the person already on that workstream, then the standing account
 * owner if they happen to hold the seat, then anyone active in it. Returning
 * null is allowed and meaningful: the seat is needed and unstaffed, which is
 * worth showing rather than hiding behind whoever was handy.
 */
async function resolveSeatHolder(clientId: string, role: TeamRole) {
  const stream = await prisma.clientWorkstream.findUnique({
    where: { clientId_role: { clientId, role } },
    select: { ownerId: true },
  });

  if (stream?.ownerId) {
    return stream.ownerId;
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { assignedUser: { select: { id: true, teamRole: true } } },
  });

  if (client?.assignedUser?.teamRole === role) {
    return client.assignedUser.id;
  }

  const candidate = await prisma.user.findFirst({
    where: { teamRole: role, isActive: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  return candidate?.id ?? null;
}
