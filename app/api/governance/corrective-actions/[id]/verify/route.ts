import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  AUDIT_FAILURE_STATUS,
  verifyCorrectiveAction,
} from "@/lib/governance/audit-service";
import { correctiveActionVerifySchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Verifies and closes a corrective action.
 *
 * Separate from the update endpoint so closure cannot be reached by setting a
 * status: the owner is refused, and the system records who checked.
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

    const parsed = correctiveActionVerifySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await verifyCorrectiveAction({
      actor,
      actionId: id,
      note: parsed.data.note,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: AUDIT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/governance/corrective-actions/:id/verify] Failed.", error);
    return NextResponse.json(
      { error: "Unable to verify the action right now." },
      { status: 500 },
    );
  }
}
