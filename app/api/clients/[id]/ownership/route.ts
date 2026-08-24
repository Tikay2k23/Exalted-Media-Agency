import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { teamRoleLabels } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clientOwnershipSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Who holds this account.
 *
 * The account owner is a field on the client; every other seat is a
 * ClientWorkstream row keyed by TeamRole, which is where the application
 * already records who runs what. This writes to both rather than introducing a
 * third place ownership lives.
 *
 * Only seats the client actually has are touched. A workstream is created by
 * the service blueprint when the account is set up, so an unknown role arriving
 * here means somebody is trying to staff a seat this client does not have, and
 * it is ignored rather than conjuring the row.
 *
 * Each change is logged by name - "Project Manager changed from Jane Smith to
 * Josri Santos" - and the person taking the seat is told, through the
 * notification system that already exists.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    /*
     * clients.edit, not a dedicated assign permission - there is no such
     * permission in this application, and inventing one would leave it
     * ungranted to every role until somebody noticed nobody could assign.
     */
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = clientOwnershipSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid assignment." }, { status: 400 });
    }

    const [before, streams, users] = await Promise.all([
      prisma.client.findUniqueOrThrow({
        where: { id: guard.client.id },
        select: { assignedUserId: true, assignedUser: { select: { name: true } } },
      }),
      prisma.clientWorkstream.findMany({
        where: { clientId: guard.client.id },
        select: { id: true, role: true, ownerId: true, owner: { select: { name: true } } },
      }),
      prisma.user.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true },
      }),
    ]);

    const nameOf = new Map(users.map((user) => [user.id, user.name]));

    // Anybody named must be a real, active person. A stale id from a form left
    // open while somebody was deactivated would otherwise assign a ghost.
    const named = [
      parsed.data.assignedUserId,
      ...parsed.data.seats.map((seat) => seat.ownerId),
    ].filter((value): value is string => Boolean(value));

    if (named.some((userId) => !nameOf.has(userId))) {
      return NextResponse.json(
        { error: "One of those people is no longer active. Reload and try again." },
        { status: 400 },
      );
    }

    const changes: { label: string; from: string; to: string; userId: string | null }[] = [];
    const byRole = new Map(streams.map((stream) => [stream.role, stream]));

    await prisma.$transaction(async (tx) => {
      if (parsed.data.assignedUserId !== before.assignedUserId) {
        await tx.client.update({
          where: { id: guard.client.id },
          data: { assignedUserId: parsed.data.assignedUserId },
        });

        changes.push({
          label: "Account Owner",
          from: before.assignedUser?.name ?? "Not assigned",
          to: parsed.data.assignedUserId
            ? nameOf.get(parsed.data.assignedUserId)!
            : "Not assigned",
          userId: parsed.data.assignedUserId,
        });
      }

      for (const seat of parsed.data.seats) {
        const stream = byRole.get(seat.role);

        // Not a seat this client has. Creating one here would staff a stream
        // the service blueprint never asked for.
        if (!stream || stream.ownerId === seat.ownerId) continue;

        await tx.clientWorkstream.update({
          where: { id: stream.id },
          data: { ownerId: seat.ownerId },
        });

        changes.push({
          label: teamRoleLabels[seat.role],
          from: stream.owner?.name ?? "Not assigned",
          to: seat.ownerId ? nameOf.get(seat.ownerId)! : "Not assigned",
          userId: seat.ownerId,
        });
      }
    });

    for (const change of changes) {
      await logActivity({
        actorId: guard.actor.id,
        action: `${change.label} on ${guard.client.companyName} changed from ${change.from} to ${change.to}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: { role: change.label, from: change.from, to: change.to },
      });
    }

    /*
     * Tell the people who just picked up a seat, not the ones who lost one -
     * the arriving seat has something to do about it. resolveRecipients drops
     * the actor, so assigning yourself does not notify you.
     */
    for (const change of changes) {
      if (!change.userId) continue;

      await createNotifications(
        resolveRecipients([change.userId], guard.actor.id).map((recipientId) => ({
          recipientId,
          type: "TASK_ASSIGNED" as const,
          urgency: "HIGH" as const,
          title: `You are ${change.label} on ${guard.client.companyName}`,
          body: `${guard.actor.name} assigned you this seat, taking over from ${change.from}.`,
          entityType: "CLIENT" as const,
          entityId: guard.client.id,
          href: `/clients/${guard.client.id}?tab=contacts`,
        })),
      );
    }

    return NextResponse.json({ ok: true, changed: changes.length });
  } catch (error) {
    return serverFailure("api/clients/:id/ownership", error);
  }
}
