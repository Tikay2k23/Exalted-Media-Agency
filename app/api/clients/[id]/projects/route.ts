import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { createProject } from "@/lib/delivery/project-service";
import { projectSchema } from "@/lib/validators";

export const runtime = "nodejs";

export const PROJECT_FAILURE_STATUS = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
} as const;

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
    const parsed = projectSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid project details" }, { status: 400 });
    }

    const result = await createProject({ actor, clientId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: PROJECT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(
      { ok: true, projectId: result.project.id },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/clients/:id/projects] Failed to create project.", error);
    return NextResponse.json(
      { error: "Unable to create this project right now." },
      { status: 500 },
    );
  }
}
