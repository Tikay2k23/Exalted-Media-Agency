import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { SECTION_BY_KEY } from "@/lib/strategy/strategy-sections";
import { strategySectionSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * One section of the strategy: how far it has got, and who has it.
 *
 * Upserted rather than required to exist, because a client's sections are a
 * catalogue rather than rows somebody creates - the first time anybody touches
 * Business Goals is the first time that row needs to exist.
 *
 * Approval stamps who and when. Moving a section back out of APPROVED clears
 * both, so a section can never read as approved by somebody who has since
 * un-approved it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "clients.edit");

    if (!guard.ok) return guard.response;

    const parsed = strategySectionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Check the section details." }, { status: 400 });
    }

    const { key, status, ownerId, notes } = parsed.data;
    const label = SECTION_BY_KEY.get(key)?.label ?? key;

    const before = await prisma.strategySection.findUnique({
      where: { clientId_key: { clientId: guard.client.id, key } },
      select: { status: true },
    });

    const approving = status === "APPROVED";

    const section = await prisma.strategySection.upsert({
      where: { clientId_key: { clientId: guard.client.id, key } },
      create: {
        clientId: guard.client.id,
        key,
        status,
        ownerId: ownerId ?? null,
        notes: notes?.trim() || null,
        updatedById: guard.actor.id,
        ...(approving ? { approvedById: guard.actor.id, approvedAt: new Date() } : {}),
      },
      update: {
        status,
        ownerId: ownerId ?? null,
        notes: notes?.trim() || null,
        updatedById: guard.actor.id,
        // Cleared when it leaves APPROVED, so nothing reads as signed off by
        // somebody who has since taken that back.
        ...(approving
          ? { approvedById: guard.actor.id, approvedAt: new Date() }
          : { approvedById: null, approvedAt: null }),
      },
    });

    if (before?.status !== status) {
      await logActivity({
        actorId: guard.actor.id,
        action:
          status === "APPROVED"
            ? `Approved the ${label} section for ${guard.client.companyName}`
            : `${label} on ${guard.client.companyName} is now ${status.replaceAll("_", " ").toLowerCase()}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: { section: key, from: before?.status ?? "NOT_STARTED", to: status },
      });
    }

    return NextResponse.json(section);
  } catch (error) {
    return serverFailure("api/clients/:id/strategy/sections", error);
  }
}
