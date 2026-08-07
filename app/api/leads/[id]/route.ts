import { NextResponse } from "next/server";

import { LEAD_FAILURE_STATUS } from "@/app/api/leads/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { logActivity } from "@/lib/activity";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { leadVisibilityWhere, updateLead } from "@/lib/sales/lead-service";
import { leadUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";

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

    const payload = await request.json();
    const parsed = leadUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid lead payload" }, { status: 400 });
    }

    const result = await updateLead({ actor, leadId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: LEAD_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(result.lead);
  } catch (error) {
    console.error("[api/leads/:id] Failed to update lead.", error);
    return NextResponse.json(
      { error: "Unable to update this lead right now." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
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

    if (!can(actor, "leads.delete")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const visibility = leadVisibilityWhere(actor);

    if (!visibility) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const lead = await prisma.lead.findFirst({
      where: { AND: [{ id }, visibility] },
      select: { id: true, businessName: true, convertedClientId: true },
    });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.convertedClientId) {
      return NextResponse.json(
        {
          error:
            "This lead became a client account and is part of that account's history. It cannot be deleted.",
          code: "ALREADY_CONVERTED",
        },
        { status: 409 },
      );
    }

    // Soft delete: sales reporting on volume, sources, and lost reasons has to
    // stay accurate, and a hard delete would silently rewrite past figures.
    await prisma.lead.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logActivity({
      actorId: actor.id,
      action: `Deleted lead ${lead.businessName}`,
      entityType: "LEAD",
      entityId: lead.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/leads/:id] Failed to delete lead.", error);
    return NextResponse.json(
      { error: "Unable to delete this lead right now." },
      { status: 500 },
    );
  }
}
