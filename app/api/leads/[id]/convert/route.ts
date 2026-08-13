import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { LEAD_FAILURE_STATUS, convertLeadToClient } from "@/lib/sales/lead-service";
import { leadConversionSchema } from "@/lib/validators";

export const runtime = "nodejs";

/** The sales-to-delivery handoff. */
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
    const parsed = leadConversionSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid conversion payload" }, { status: 400 });
    }

    const result = await convertLeadToClient({ actor, leadId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: LEAD_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        clientId: result.client.id,
        companyName: result.client.companyName,
        generatedTaskCount: result.generatedTaskCount,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/leads/:id/convert] Failed to convert lead.", error);
    return NextResponse.json(
      { error: "Unable to convert this lead right now." },
      { status: 500 },
    );
  }
}
