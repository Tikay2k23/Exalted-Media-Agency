import { NextResponse } from "next/server";

import { APPROVAL_FAILURE_STATUS, withdrawApproval } from "@/lib/approvals/approval-service";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { approvalWithdrawalSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Withdrawing is its own endpoint rather than a status field on an update,
 * for the same reason closing a defect is: it changes what a launch gate will
 * accept, so it should not be reachable by anything that merely edits a record.
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

    const parsed = approvalWithdrawalSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "A reason is required" }, { status: 400 });
    }

    const result = await withdrawApproval({
      actor,
      approvalId: id,
      reason: parsed.data.reason,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: APPROVAL_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/approvals/:id/withdraw] Failed to withdraw approval.", error);
    return NextResponse.json(
      { error: "Unable to withdraw the approval right now." },
      { status: 500 },
    );
  }
}
