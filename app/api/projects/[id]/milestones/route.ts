import { NextResponse } from "next/server";

import { PROJECT_FAILURE_STATUS } from "@/app/api/clients/[id]/projects/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { addMilestone } from "@/lib/delivery/project-service";
import { milestoneSchema } from "@/lib/validators";

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

    const payload = await request.json();
    const parsed = milestoneSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid milestone details" }, { status: 400 });
    }

    const result = await addMilestone({ actor, projectId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: PROJECT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[api/projects/:id/milestones] Failed to add milestone.", error);
    return NextResponse.json(
      { error: "Unable to add this milestone right now." },
      { status: 500 },
    );
  }
}
