import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { EOD_FAILURE_STATUS, getTaskEodHistory, submitEod } from "@/lib/eod/eod-service";
import { prisma } from "@/lib/prisma";
import { canViewTask } from "@/lib/tasks/task-workflow";

export const runtime = "nodejs";

const bodySchema = z.object({
  entryDate: z.string().min(1).nullish(),
  summary: z.string().trim().min(2).max(4000),
  nextSteps: z.string().trim().min(2).max(2000),
  blockers: z.string().max(2000).nullish(),
  progressPercent: z.number().int().min(0).max(100).nullish(),
  hoursSpent: z.number().min(0).max(24).nullish(),
  workLink: z.string().max(500).nullish(),
  supportNeeded: z.string().max(2000).nullish(),
  taskStatus: z
    .enum(["IN_PROGRESS", "WAITING_CLIENT", "BLOCKED", "NEEDS_REVIEW", "TODO"])
    .nullish(),
});

/**
 * Writing today's entry.
 *
 * The rule lives in the service, not here: only the person doing the work may
 * file it. This handler proves who is asking and hands over.
 */
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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid EOD details" },
      { status: 400 },
    );
  }

  const result = await submitEod({
    actor,
    taskId: id,
    entry: {
      ...parsed.data,
      entryDate: parsed.data.entryDate ?? null,
      progressPercent: parsed.data.progressPercent ?? null,
      hoursSpent: parsed.data.hoursSpent ?? null,
      blockers: parsed.data.blockers ?? null,
      workLink: parsed.data.workLink ?? null,
      supportNeeded: parsed.data.supportNeeded ?? null,
      taskStatus: parsed.data.taskStatus ?? null,
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: EOD_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json(
    { ok: true, entry: result.entry, revised: result.revised },
    { status: result.revised ? 200 : 201 },
  );
}

/** The entry history on one task, for whoever can see the task. */
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

  // Not found rather than forbidden: confirming a task exists on an account
  // somebody is not on is itself a leak.
  if (!task || !canViewTask(actor, task)) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ entries: await getTaskEodHistory(id) });
}
