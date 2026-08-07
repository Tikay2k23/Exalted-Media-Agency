import { NextResponse } from "next/server";

import { LEAD_FAILURE_STATUS } from "@/app/api/leads/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { logLeadCall } from "@/lib/sales/lead-service";
import { leadCallLogSchema } from "@/lib/validators";

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

    const payload = await request.json();
    const parsed = leadCallLogSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid call payload" }, { status: 400 });
    }

    const result = await logLeadCall({ actor, leadId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: LEAD_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(result.call, { status: 201 });
  } catch (error) {
    console.error("[api/leads/:id/calls] Failed to log call.", error);
    return NextResponse.json(
      { error: "Unable to log this call right now." },
      { status: 500 },
    );
  }
}
