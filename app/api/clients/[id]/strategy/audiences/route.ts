import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { strategyAudiencesSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * The client's audiences, replaced as a list.
 *
 * The same whole-list write the goals use, and safe for the same reason: the
 * editor shows every audience at once, so nothing is written back that the
 * person could not see. Rows matched by id keep their identity across edits.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = strategyAudiencesSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the audiences and try again." },
        { status: 400 },
      );
    }

    const incoming = parsed.data.audiences;
    const existing = await prisma.strategyAudience.findMany({
      where: { clientId: guard.client.id },
      select: { id: true },
    });
    const kept = new Set(
      incoming.map((a) => a.id).filter((v): v is string => Boolean(v)),
    );
    const removed = existing.filter((a) => !kept.has(a.id));

    await prisma.$transaction(async (tx) => {
      if (removed.length > 0) {
        await tx.strategyAudience.deleteMany({
          where: { id: { in: removed.map((a) => a.id) } },
        });
      }

      for (const [position, audience] of incoming.entries()) {
        const data = {
          tier: audience.tier,
          name: audience.name,
          location: audience.location?.trim() || null,
          attributes: audience.attributes?.trim() || null,
          needs: audience.needs?.trim() || null,
          painPoints: audience.painPoints?.trim() || null,
          buyingTriggers: audience.buyingTriggers?.trim() || null,
          objections: audience.objections?.trim() || null,
          decisionMakers: audience.decisionMakers?.trim() || null,
          channels: audience.channels?.trim() || null,
          notes: audience.notes?.trim() || null,
          position,
        };

        if (audience.id) {
          await tx.strategyAudience.updateMany({
            where: { id: audience.id, clientId: guard.client.id },
            data,
          });
        } else {
          await tx.strategyAudience.create({ data: { ...data, clientId: guard.client.id } });
        }
      }
    });

    await logActivity({
      actorId: guard.actor.id,
      action: `Updated the target audience for ${guard.client.companyName}`,
      entityType: "CLIENT",
      entityId: guard.client.id,
      metadataJson: { audiences: incoming.length, removed: removed.length },
    });

    return NextResponse.json({ ok: true, audiences: incoming.length });
  } catch (error) {
    return serverFailure("api/clients/:id/strategy/audiences", error);
  }
}
