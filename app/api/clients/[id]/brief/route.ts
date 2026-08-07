import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { saveBrief } from "@/lib/strategy/brief-service";
import { strategyBriefSchema } from "@/lib/validators";

export const runtime = "nodejs";

export const BRIEF_FAILURE_STATUS = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  /** The brief is real but not ready; the caller can fix it and retry. */
  INCOMPLETE: 409,
  SELF_APPROVAL: 409,
} as const;

export async function PUT(
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

    const parsed = strategyBriefSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid brief details" }, { status: 400 });
    }

    const result = await saveBrief({ actor, clientId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code, missing: result.missing },
        { status: BRIEF_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({
      ok: true,
      returnedForRevision: result.returnedForRevision,
    });
  } catch (error) {
    console.error("[api/clients/:id/brief] Failed to save brief.", error);
    return NextResponse.json(
      { error: "Unable to save the brief right now." },
      { status: 500 },
    );
  }
}
