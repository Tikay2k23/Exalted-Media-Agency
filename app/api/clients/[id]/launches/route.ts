import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { createLaunch } from "@/lib/launch/launch-service";
import { launchSchema } from "@/lib/validators";

export const runtime = "nodejs";

export const LAUNCH_FAILURE_STATUS = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  /** Not ready is a state of the world, not a malformed request. */
  NOT_READY: 409,
} as const;

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

    const parsed = launchSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid launch details" }, { status: 400 });
    }

    const result = await createLaunch({ actor, clientId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: LAUNCH_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/launches] Failed to create launch.", error);
    return NextResponse.json(
      { error: "Unable to schedule this launch right now." },
      { status: 500 },
    );
  }
}
