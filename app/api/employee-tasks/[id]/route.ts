import { ActivityEntityType } from "@prisma/client";
import { startOfWeek } from "date-fns";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  canManageEmployeeTasks,
  canUpdateEmployeeTask,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { employeeTaskUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PATCH(
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
      client: {
        select: { id: true, companyName: true },
      },
      assignedTo: {
        select: { id: true, name: true },
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
  const parsed = employeeTaskUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid task update payload" }, { status: 400 });
  }

  const isManagerUpdate = canManageEmployeeTasks(session.user.role);

  if (!isManagerUpdate) {
    const updatedTask = await prisma.employeeTask.update({
      where: { id },
      data: {
        status: parsed.data.status,
      },
    });

    await logActivity({
      actorId: session.user.id,
      action: `Updated "${task.title}" status to ${updatedTask.status.replaceAll("_", " ")}`,
      entityType: ActivityEntityType.EMPLOYEE_TASK,
      entityId: updatedTask.id,
    });

    return NextResponse.json(updatedTask);
  }

  if (parsed.data.assignedToId) {
    const assignee = await prisma.user.findUnique({
      where: { id: parsed.data.assignedToId },
      select: { id: true },
    });

    if (!assignee) {
      return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
    }
  }

  if (parsed.data.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: parsed.data.clientId },
      select: { id: true },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }
  }

  const updatedTask = await prisma.employeeTask.update({
    where: { id },
    data: (() => {
      const dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : task.dueDate;

      return {
        title: parsed.data.title ?? task.title,
        note:
          typeof parsed.data.note === "string"
            ? parsed.data.note || null
            : task.note,
        weekStartDate: startOfWeek(dueDate, { weekStartsOn: 1 }),
        dueDate,
        priority: parsed.data.priority ?? task.priority,
        category: parsed.data.category ?? task.category,
        estimatedHours: parsed.data.estimatedHours ?? task.estimatedHours,
        status: parsed.data.status,
        assignedToId: parsed.data.assignedToId || task.assignedToId,
        clientId:
          typeof parsed.data.clientId === "string"
            ? parsed.data.clientId || null
            : task.clientId,
      };
    })(),
  });

  await logActivity({
    actorId: session.user.id,
    action: `Updated agency task "${task.title}"`,
    entityType: ActivityEntityType.EMPLOYEE_TASK,
    entityId: updatedTask.id,
  });

  return NextResponse.json(updatedTask);
}
