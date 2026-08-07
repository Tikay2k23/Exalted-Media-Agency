import { NextResponse } from "next/server";

import { LAUNCH_FAILURE_STATUS } from "@/app/api/clients/[id]/launches/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { activateLaunch } from "@/lib/launch/launch-service";

export const runtime = "nodejs";

/** Takes a launch live. Refuses unless it is genuinely ready. */
export async function POST(
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

    const result = await activateLaunch({ actor, launchId: id });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code, blockers: result.blockers },
        { status: LAUNCH_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/launches/:id/activate] Failed to activate launch.", error);
    return NextResponse.json(
      { error: "Unable to activate this launch right now." },
      { status: 500 },
    );
  }
}
