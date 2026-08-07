import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clientDetailsSchema } from "@/lib/validators";

export const runtime = "nodejs";

function toDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Partial update of an account's commercial and health fields.
 *
 * This is what makes a blocked stage requirement resolvable: the gate says
 * "contract start date and monthly value missing", and this is where they get
 * entered, without re-submitting the whole account.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerAuthSession();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!can(actor, "clients.edit")) {
      return NextResponse.json(
        { error: "You do not have permission to edit this account." },
        { status: 403 },
      );
    }

    const existing = await prisma.client.findFirst({
      where: {
        id,
        deletedAt: null,
        // Someone who can only see their own accounts cannot edit another's.
        ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
      },
      select: {
        id: true,
        companyName: true,
        healthStatus: true,
        monthlyValue: true,
        assignedUserId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const payload = await request.json();
    const parsed = clientDetailsSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid account details" }, { status: 400 });
    }

    const data: Prisma.ClientUpdateInput = {};
    const input = parsed.data;

    // Health is deliberately not accepted here. It moves only by recording an
    // assessment, so every colour on the board has a person, a date and a
    // reason behind it. Ignored rather than rejected, so an older client
    // sending the field still saves the rest of the form.
    if (input.monthlyValue !== undefined) {
      data.monthlyValue = input.monthlyValue;
    }
    for (const field of ["contractStartDate", "contractEndDate", "renewalDate", "nextActionDueAt"] as const) {
      if (input[field] !== undefined) {
        data[field] = toDate(input[field]);
      }
    }
    for (const field of ["currentBlocker", "nextAction"] as const) {
      if (input[field] !== undefined) {
        data[field] = input[field] || null;
      }
    }

    if (input.assignedUserId !== undefined) {
      if (input.assignedUserId) {
        const assignee = await prisma.user.findFirst({
          where: { id: input.assignedUserId, isActive: true, deletedAt: null },
          select: { id: true },
        });

        if (!assignee) {
          return NextResponse.json(
            { error: "That team member could not be found." },
            { status: 404 },
          );
        }

        data.assignedUser = { connect: { id: input.assignedUserId } };
      } else {
        data.assignedUser = { disconnect: true };
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true, updated: false });
    }

    const client = await prisma.client.update({ where: { id }, data });

    await logActivity({
      actorId: actor.id,
      action: `Updated account details for ${client.companyName}`,
      entityType: "CLIENT",
      entityId: client.id,
      metadataJson: { fields: Object.keys(data) },
    });

    return NextResponse.json({ ok: true, updated: true });
  } catch (error) {
    console.error("[api/clients/:id/details] Failed to update account.", error);
    return NextResponse.json(
      { error: "Unable to save these details right now." },
      { status: 500 },
    );
  }
}
