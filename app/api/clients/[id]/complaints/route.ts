import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { HEALTH_FAILURE_STATUS, raiseComplaint } from "@/lib/success/health-service";
import { complaintSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(
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

    const parsed = complaintSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid complaint details" }, { status: 400 });
    }

    const followUpAt = parsed.data.followUpAt ? new Date(parsed.data.followUpAt) : null;

    if (followUpAt && Number.isNaN(followUpAt.getTime())) {
      return NextResponse.json({ error: "Invalid follow-up date" }, { status: 400 });
    }

    const result = await raiseComplaint({
      actor,
      clientId: id,
      title: parsed.data.title,
      description: parsed.data.description,
      serviceArea: parsed.data.serviceArea,
      businessImpact: parsed.data.businessImpact,
      evidenceUrl: parsed.data.evidenceUrl,
      ownerId: parsed.data.ownerId,
      followUpAt,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: HEALTH_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, complaintId: result.complaint.id }, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/complaints] Failed to record complaint.", error);
    return NextResponse.json(
      { error: "Unable to record the complaint right now." },
      { status: 500 },
    );
  }
}
