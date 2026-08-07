import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { createLead } from "@/lib/sales/lead-service";
import { leadFormSchema } from "@/lib/validators";

export const runtime = "nodejs";

/** Maps a lead service failure onto an HTTP status. */
export const LEAD_FAILURE_STATUS = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ALREADY_CONVERTED: 409,
  INVALID: 400,
  STAGE_NOT_FOUND: 400,
} as const;

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = leadFormSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid lead payload" }, { status: 400 });
    }

    const result = await createLead({ actor, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: LEAD_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(result.lead, { status: 201 });
  } catch (error) {
    console.error("[api/leads] Failed to create lead.", error);
    return NextResponse.json(
      { error: "Unable to create this lead right now." },
      { status: 500 },
    );
  }
}
