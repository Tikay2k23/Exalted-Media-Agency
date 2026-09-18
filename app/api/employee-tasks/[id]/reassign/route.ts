import { NextResponse } from "next/server";
import { z } from "zod";

import { TASK_FAILURE_STATUS, reassignTask } from "@/lib/tasks/task-workflow";
import { teamActor } from "@/lib/team/team-auth";

export const runtime = "nodejs";

const schema = z.object({ assigneeId: z.string().min(1).max(60) });

/** Hands a task to somebody else. Scoped in reassignTask. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await teamActor();

  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) return NextResponse.json({ error: "Choose who takes this task." }, { status: 400 });

  const result = await reassignTask({ actor: auth.actor, taskId: id, assigneeId: parsed.data.assigneeId });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: TASK_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true });
}
