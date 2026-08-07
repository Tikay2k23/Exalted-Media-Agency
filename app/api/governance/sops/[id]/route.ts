import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  SOP_FAILURE_STATUS,
  activateSop,
  recordSopReview,
} from "@/lib/governance/sop-service";
import { sopActionSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Activates an SOP, or records that it has been reviewed.
 *
 * Separate from the write endpoint: activation is what makes a document the
 * rule everybody follows, and it is refused for the author of the version.
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

    const parsed = sopActionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result =
      parsed.data.action === "activate"
        ? await activateSop({ actor, sopId: id })
        : await recordSopReview({ actor, sopId: id });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: SOP_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, status: result.sop.status });
  } catch (error) {
    console.error("[api/governance/sops/:id] Failed to update SOP.", error);
    return NextResponse.json({ error: "Unable to update the SOP right now." }, { status: 500 });
  }
}
