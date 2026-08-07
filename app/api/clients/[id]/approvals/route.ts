import { NextResponse } from "next/server";

import { APPROVAL_FAILURE_STATUS, recordApproval } from "@/lib/approvals/approval-service";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { clientApprovalSchema } from "@/lib/validators";

export const runtime = "nodejs";

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

    const parsed = clientApprovalSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid approval details" }, { status: 400 });
    }

    const approvedAt = parsed.data.approvedAt ? new Date(parsed.data.approvedAt) : null;

    if (approvedAt && Number.isNaN(approvedAt.getTime())) {
      return NextResponse.json({ error: "Invalid approval date" }, { status: 400 });
    }

    const result = await recordApproval({
      actor,
      clientId: id,
      type: parsed.data.type,
      subject: parsed.data.subject,
      approverContactId: parsed.data.approverContactId,
      approvedAt,
      evidenceUrl: parsed.data.evidenceUrl,
      notes: parsed.data.notes,
      projectId: parsed.data.projectId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: APPROVAL_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, approvalId: result.approval.id }, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/approvals] Failed to record approval.", error);
    return NextResponse.json(
      { error: "Unable to record the approval right now." },
      { status: 500 },
    );
  }
}
