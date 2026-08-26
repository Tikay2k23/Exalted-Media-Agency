import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { raiseJourneyFlag, resolveJourneyFlag } from "@/lib/journey/flag-service";
import { prisma as db } from "@/lib/prisma";
import { clientNextStepSchema } from "@/lib/validators";

export const runtime = "nodejs";

function toDate(value: string | undefined) {
  if (!value) return null;

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * What is stopping this account, and what happens next.
 *
 * Two fields that carry more weight than their size suggests. A recorded
 * blocker turns the account's journey health to Blocked on three pages; an
 * empty next action is one of the reasons Needs Attention lists an account. The
 * Account tab is where both are set, which is where the Needs Attention row
 * sends people.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = clientNextStepSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "That is longer than this field holds. Keep it under 500 characters." },
        { status: 400 },
      );
    }

    const before = await prisma.client.findUniqueOrThrow({
      where: { id: guard.client.id },
      select: { currentBlocker: true, nextAction: true, nextActionDueAt: true },
    });

    const currentBlocker = parsed.data.currentBlocker?.trim() || null;
    const nextAction = parsed.data.nextAction?.trim() || null;
    const nextActionDueAt = toDate(parsed.data.nextActionDueAt);

    await prisma.client.update({
      where: { id: guard.client.id },
      data: { nextAction, nextActionDueAt },
    });

    /*
     * The blocker is a record, not a sentence on the client row.
     *
     * Client.currentBlocker drives health, the journey board and the attention
     * list, and it used to be writable from here as free text - so an account
     * could read Blocked with nothing behind it that anybody could own, date,
     * or resolve except by clearing a text box. Setting one now raises the same
     * journey flag the Journey tab raises, and the column is left to the flag
     * service to mirror. One writer, one thing to resolve.
     */
    if (before.currentBlocker !== currentBlocker) {
      const open = await db.clientJourneyFlag.findFirst({
        where: { clientId: guard.client.id, kind: "BLOCKED", resolvedAt: null },
        orderBy: { raisedAt: "desc" },
        select: { id: true },
      });

      if (currentBlocker) {
        // Replace rather than stack: this field holds one blocker at a time.
        if (open) {
          await resolveJourneyFlag({
            actor: guard.actor,
            flagId: open.id,
            note: "Replaced by an updated blocker.",
          });
        }

        await raiseJourneyFlag({
          actor: guard.actor,
          clientId: guard.client.id,
          kind: "BLOCKED",
          reason: currentBlocker,
          impact: "BLOCKS_STAGE",
        });
      } else if (open) {
        await resolveJourneyFlag({
          actor: guard.actor,
          flagId: open.id,
          note: "Cleared from the client record.",
        });
      }
    }

    /*
     * The blocker is logged separately from the next action, and by what it
     * says. "Account details updated" tells nobody why a client's health went
     * red a fortnight ago.
     */
    if (before.currentBlocker !== currentBlocker) {
      await logActivity({
        actorId: guard.actor.id,
        action: currentBlocker
          ? `Blocked ${guard.client.companyName}: ${currentBlocker}`
          : `Cleared the blocker on ${guard.client.companyName}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: { previous: before.currentBlocker, blocker: currentBlocker },
      });
    }

    if (before.nextAction !== nextAction) {
      await logActivity({
        actorId: guard.actor.id,
        action: nextAction
          ? `Next action on ${guard.client.companyName}: ${nextAction}`
          : `Cleared the next action on ${guard.client.companyName}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: { previous: before.nextAction, nextAction },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverFailure("api/clients/:id/next-step", error);
  }
}
