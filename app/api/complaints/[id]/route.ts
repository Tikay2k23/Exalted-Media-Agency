import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { HEALTH_FAILURE_STATUS, updateComplaint } from "@/lib/success/health-service";
import { complaintUpdateSchema } from "@/lib/validators";

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

    const parsed = complaintUpdateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid complaint details" }, { status: 400 });
    }

    const followUpAt = parsed.data.followUpAt ? new Date(parsed.data.followUpAt) : undefined;

    if (followUpAt && Number.isNaN(followUpAt.getTime())) {
      return NextResponse.json({ error: "Invalid follow-up date" }, { status: 400 });
    }

    const result = await updateComplaint({
      actor,
      complaintId: id,
      status: parsed.data.status,
      rootCause: parsed.data.rootCause,
      resolutionPlan: parsed.data.resolutionPlan,
      clientCommunication: parsed.data.clientCommunication,
      finalOutcome: parsed.data.finalOutcome,
      ownerId: parsed.data.ownerId,
      followUpAt,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: HEALTH_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/complaints/:id] Failed to update complaint.", error);
    return NextResponse.json(
      { error: "Unable to update the complaint right now." },
      { status: 500 },
    );
  }
}
