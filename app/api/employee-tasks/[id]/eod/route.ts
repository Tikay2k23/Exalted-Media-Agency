import { ActivityEntityType } from "@prisma/client";
import { startOfDay } from "date-fns";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canUpdateEmployeeTask } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { employeeTaskEodEntrySchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  const { id } = await params;

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const task = await prisma.employeeTask.findUnique({
    where: { id },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
        },
      },
      client: {
        select: {
          id: true,
          companyName: true,
        },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (
    !canUpdateEmployeeTask(
      session.user.role,
      session.user.id,
      task.assignedToId,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json();
  const parsed = employeeTaskEodEntrySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid EOD payload" }, { status: 400 });
  }

  const entryDate = startOfDay(new Date(parsed.data.entryDate));

  const entry = await prisma.employeeTaskEodEntry.upsert({
    where: {
      taskId_authorId_entryDate: {
        taskId: task.id,
        authorId: session.user.id,
        entryDate,
      },
    },
    update: {
      summary: parsed.data.summary,
      blockers: parsed.data.blockers || null,
      nextSteps: parsed.data.nextSteps || null,
    },
    create: {
      taskId: task.id,
      authorId: session.user.id,
      entryDate,
      summary: parsed.data.summary,
      blockers: parsed.data.blockers || null,
      nextSteps: parsed.data.nextSteps || null,
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
  });

  await logActivity({
    actorId: session.user.id,
    action: `Posted EOD update for "${task.title}"`,
    entityType: ActivityEntityType.EMPLOYEE_TASK,
    entityId: task.id,
    metadataJson: {
      entryDate: entry.entryDate.toISOString(),
      clientId: task.client?.id ?? null,
      assigneeId: task.assignedTo.id,
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
