import { NextResponse } from "next/server";

import { QUALITY_FAILURE_STATUS } from "@/app/api/clients/[id]/defects/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { closeDefect } from "@/lib/quality/defect-service";
import { defectClosureSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Closing a defect is its own endpoint so the self-verification rule cannot be
 * sidestepped by a plain status update.
 */
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

    const parsed = defectClosureSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid closure payload" }, { status: 400 });
    }

    const result = await closeDefect({
      actor,
      defectId: id,
      resolution: parsed.data.resolution,
      retestResult: parsed.data.retestResult,
      overrideReason: parsed.data.overrideReason,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: QUALITY_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, selfVerified: result.selfVerified });
  } catch (error) {
    console.error("[api/defects/:id/close] Failed to close defect.", error);
    return NextResponse.json(
      { error: "Unable to close this defect right now." },
      { status: 500 },
    );
  }
}
