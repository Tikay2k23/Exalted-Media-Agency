import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { AUDIT_FAILURE_STATUS, saveAudit } from "@/lib/governance/audit-service";
import { auditSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = auditSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid audit details" }, { status: 400 });
    }

    const result = await saveAudit({
      actor,
      auditId: parsed.data.auditId,
      type: parsed.data.type,
      scope: parsed.data.scope,
      clientId: parsed.data.clientId,
      auditorId: parsed.data.auditorId,
      summary: parsed.data.summary,
      complianceScore: parsed.data.complianceScore,
      overallResult: parsed.data.overallResult,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: AUDIT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, auditId: result.audit.id }, { status: 201 });
  } catch (error) {
    console.error("[api/governance/audits] Failed to save audit.", error);
    return NextResponse.json({ error: "Unable to save the audit right now." }, { status: 500 });
  }
}
