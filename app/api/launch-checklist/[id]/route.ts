import { NextResponse } from "next/server";

import { LAUNCH_FAILURE_STATUS } from "@/app/api/clients/[id]/launches/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { setChecklistItemStatus } from "@/lib/launch/launch-service";
import { checklistItemSchema } from "@/lib/validators";

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

    const parsed = checklistItemSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid checklist payload" }, { status: 400 });
    }

    const result = await setChecklistItemStatus({
      actor,
      itemId: id,
      status: parsed.data.status,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: LAUNCH_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/launch-checklist/:id] Failed to update item.", error);
    return NextResponse.json(
      { error: "Unable to update this checklist item right now." },
      { status: 500 },
    );
  }
}
