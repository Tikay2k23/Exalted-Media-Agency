import { NextResponse } from "next/server";
import { z } from "zod";

import { TASK_FAILURE_STATUS, setChecklistItem } from "@/lib/tasks/task-workflow";
import { teamActor } from "@/lib/team/team-auth";

export const runtime = "nodejs";

const schema = z.object({ itemId: z.string().min(1).max(20), done: z.boolean() });

/** Ticks or unticks one checklist item. Anybody who can see the task may. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await teamActor();

  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) return NextResponse.json({ error: "Invalid checklist update." }, { status: 400 });

  const result = await setChecklistItem({ actor: auth.actor, taskId: id, ...parsed.data });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: TASK_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true, checklist: result.checklist });
}
