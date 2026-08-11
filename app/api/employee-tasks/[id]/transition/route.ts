import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  TASK_FAILURE_STATUS,
  archiveTask,
  changeTaskStatus,
  reviewTask,
  submitForReview,
} from "@/lib/tasks/task-workflow";

export const runtime = "nodejs";

/**
 * Every move a task can make, behind one door.
 *
 * The rules live in the workflow service, not here. This handler's only job is
 * to prove who is asking and hand over - so there is no route that can quietly
 * set a status the service would have refused.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    status: z.enum([
      "BACKLOG",
      "TODO",
      "IN_PROGRESS",
      "WAITING_CLIENT",
      "BLOCKED",
      "REVISION_REQUIRED",
      "DONE",
      "CANCELLED",
    ]),
    actualHours: z.number().int().min(0).max(1000).nullish(),
  }),
  z.object({
    action: z.literal("submit"),
    actualHours: z.number().int().min(0).max(1000).nullish(),
    note: z.string().max(2000).nullish(),
  }),
  z.object({
    action: z.literal("review"),
    decision: z.enum(["APPROVE", "REQUEST_REVISION"]),
    note: z.string().max(2000).nullish(),
  }),
  z.object({
    action: z.literal("archive"),
    archived: z.boolean(),
  }),
]);

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
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const body = parsed.data;

  const result = await (() => {
    switch (body.action) {
      case "status":
        return changeTaskStatus({
          actor,
          taskId: id,
          status: body.status,
          actualHours: body.actualHours ?? null,
        });
      case "submit":
        return submitForReview({
          actor,
          taskId: id,
          actualHours: body.actualHours ?? null,
          note: body.note ?? null,
        });
      case "review":
        return reviewTask({
          actor,
          taskId: id,
          decision: body.decision,
          note: body.note ?? null,
        });
      case "archive":
        return archiveTask({ actor, taskId: id, archived: body.archived });
    }
  })();

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: TASK_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true, task: result.task });
}
