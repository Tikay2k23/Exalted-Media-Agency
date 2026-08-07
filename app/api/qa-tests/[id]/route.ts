import { NextResponse } from "next/server";

import { QUALITY_FAILURE_STATUS } from "@/app/api/clients/[id]/defects/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { recordTestResult } from "@/lib/quality/defect-service";
import { qaTestResultSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PATCH(
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

    const parsed = qaTestResultSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid test result" },
        { status: 400 },
      );
    }

    const result = await recordTestResult({
      actor,
      testId: id,
      status: parsed.data.status,
      actualResult: parsed.data.actualResult,
      evidenceUrl: parsed.data.evidenceUrl,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: QUALITY_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/qa-tests/:id] Failed to record result.", error);
    return NextResponse.json(
      { error: "Unable to record this result right now." },
      { status: 500 },
    );
  }
}
