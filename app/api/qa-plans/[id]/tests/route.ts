import { NextResponse } from "next/server";

import { QUALITY_FAILURE_STATUS } from "@/app/api/clients/[id]/defects/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { addQaTest } from "@/lib/quality/defect-service";
import { qaTestSchema } from "@/lib/validators";

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

    const parsed = qaTestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid test details" }, { status: 400 });
    }

    const result = await addQaTest({ actor, planId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: QUALITY_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[api/qa-plans/:id/tests] Failed to add test.", error);
    return NextResponse.json(
      { error: "Unable to add this test right now." },
      { status: 500 },
    );
  }
}
