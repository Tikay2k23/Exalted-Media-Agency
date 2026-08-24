import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
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
      data: { currentBlocker, nextAction, nextActionDueAt },
    });

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
