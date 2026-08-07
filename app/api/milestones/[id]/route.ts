import { NextResponse } from "next/server";

import { PROJECT_FAILURE_STATUS } from "@/app/api/clients/[id]/projects/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { setMilestoneCompletion } from "@/lib/delivery/project-service";
import { milestoneCompletionSchema } from "@/lib/validators";

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

    const payload = await request.json();
    const parsed = milestoneCompletionSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid milestone payload" }, { status: 400 });
    }

    const result = await setMilestoneCompletion({
      actor,
      milestoneId: id,
      completed: parsed.data.completed,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: PROJECT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/milestones/:id] Failed to update milestone.", error);
    return NextResponse.json(
      { error: "Unable to update this milestone right now." },
      { status: 500 },
    );
  }
}
