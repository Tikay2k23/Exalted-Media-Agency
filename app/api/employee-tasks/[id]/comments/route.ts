import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getTaskActivity, getTaskComments } from "@/lib/tasks/task-queries";
import { TASK_FAILURE_STATUS, addTaskComment, canViewTask } from "@/lib/tasks/task-workflow";

export const runtime = "nodejs";

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

/**
 * The conversation and the trail, fetched together.
 *
 * One request rather than two because the drawer opens both tabs' worth of
 * content at once, and a second round trip only buys a second spinner.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  const { id } = await params;

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await loadAuthContext(session.user.id);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const task = await prisma.employeeTask.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, assignedToId: true, createdById: true, reviewerId: true },
  });

  // Not found rather than forbidden: telling somebody a task exists but is not
  // theirs is itself a leak about accounts they are not on.
  if (!task || !canViewTask(actor, task)) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const [comments, activity] = await Promise.all([
    getTaskComments(id),
    getTaskActivity(id),
  ]);

  return NextResponse.json({ comments, activity });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  const { id } = await params;

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await loadAuthContext(session.user.id);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "A comment needs something in it." }, { status: 400 });
  }

  const result = await addTaskComment({ actor, taskId: id, body: parsed.data.body });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: TASK_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true, comment: result.comment }, { status: 201 });
}
