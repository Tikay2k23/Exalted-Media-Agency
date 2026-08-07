import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { AUDIT_FAILURE_STATUS, completeAudit } from "@/lib/governance/audit-service";

export const runtime = "nodejs";

/**
 * Closes an audit.
 *
 * Its own endpoint because it is refused while a critical finding has nothing
 * being done about it, and that is a decision, not a field update.
 */
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

    const result = await completeAudit({ actor, auditId: id });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code, outstanding: result.outstanding },
        { status: AUDIT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/governance/audits/:id/complete] Failed to complete audit.", error);
    return NextResponse.json({ error: "Unable to complete the audit right now." }, { status: 500 });
  }
}
