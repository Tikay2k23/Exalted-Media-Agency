import { NextResponse } from "next/server";

import { QUALITY_FAILURE_STATUS } from "@/app/api/clients/[id]/defects/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { updateDefect } from "@/lib/quality/defect-service";
import { defectUpdateSchema } from "@/lib/validators";

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

    const parsed = defectUpdateSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid defect details" }, { status: 400 });
    }

    const result = await updateDefect({ actor, defectId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: QUALITY_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/defects/:id] Failed to update defect.", error);
    return NextResponse.json(
      { error: "Unable to update this defect right now." },
      { status: 500 },
    );
  }
}
