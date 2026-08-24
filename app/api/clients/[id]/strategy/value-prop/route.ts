import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { strategyValuePropSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * What the client says, and why anybody should believe it.
 *
 * One record per client, upserted: a business with two value propositions has
 * not chosen one yet, and the card would have nothing to lead with.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = strategyValuePropSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the details and try again." },
        { status: 400 },
      );
    }

    const text = (value: string | undefined) => value?.trim() || null;
    const data = {
      statement: text(parsed.data.statement),
      offer: text(parsed.data.offer),
      primaryOutcome: text(parsed.data.primaryOutcome),
      differentiators: parsed.data.differentiators.map((d) => d.trim()).filter(Boolean),
      proofPoints: text(parsed.data.proofPoints),
      guarantees: text(parsed.data.guarantees),
      objections: text(parsed.data.objections),
      positioningStatement: text(parsed.data.positioningStatement),
      competitorNotes: text(parsed.data.competitorNotes),
    };

    await prisma.strategyValueProp.upsert({
      where: { clientId: guard.client.id },
      create: { ...data, clientId: guard.client.id },
      update: data,
    });

    await logActivity({
      actorId: guard.actor.id,
      action: `Updated the value proposition for ${guard.client.companyName}`,
      entityType: "CLIENT",
      entityId: guard.client.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverFailure("api/clients/:id/strategy/value-prop", error);
  }
}
