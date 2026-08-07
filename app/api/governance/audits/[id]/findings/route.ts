import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { AUDIT_FAILURE_STATUS, recordFinding } from "@/lib/governance/audit-service";
import { auditFindingSchema } from "@/lib/validators";

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

    const parsed = auditFindingSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid finding details" }, { status: 400 });
    }

    const result = await recordFinding({
      actor,
      auditId: id,
      title: parsed.data.title,
      detail: parsed.data.detail,
      result: parsed.data.result,
      isCritical: parsed.data.isCritical,
      sopId: parsed.data.sopId,
      evidenceUrl: parsed.data.evidenceUrl,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: AUDIT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, findingId: result.finding.id }, { status: 201 });
  } catch (error) {
    console.error("[api/governance/audits/:id/findings] Failed to record finding.", error);
    return NextResponse.json({ error: "Unable to record the finding right now." }, { status: 500 });
  }
}
