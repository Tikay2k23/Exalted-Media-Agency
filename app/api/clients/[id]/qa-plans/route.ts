import { NextResponse } from "next/server";

import { QUALITY_FAILURE_STATUS } from "@/app/api/clients/[id]/defects/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { createQaPlan } from "@/lib/quality/defect-service";
import { qaPlanSchema } from "@/lib/validators";

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

    const parsed = qaPlanSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid QA plan details" }, { status: 400 });
    }

    const result = await createQaPlan({ actor, clientId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: QUALITY_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/qa-plans] Failed to create QA plan.", error);
    return NextResponse.json(
      { error: "Unable to create this QA plan right now." },
      { status: 500 },
    );
  }
}
