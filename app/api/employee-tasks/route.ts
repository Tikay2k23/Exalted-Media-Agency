import { ActivityEntityType } from "@prisma/client";
import { startOfWeek } from "date-fns";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canManageEmployeeTasks } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { employeeTaskFormSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageEmployeeTasks(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json();
  const parsed = employeeTaskFormSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid employee task payload" }, { status: 400 });
  }

  const [assignee, client] = await Promise.all([
    prisma.user.findUnique({
      where: { id: parsed.data.assignedToId },
      select: { id: true, name: true },
    }),
    parsed.data.clientId
      ? prisma.client.findUnique({
          where: { id: parsed.data.clientId },
          select: { id: true, companyName: true },
        })
      : Promise.resolve(null),
  ]);

  if (!assignee) {
    return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
  }

  if (parsed.data.clientId && !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const task = await prisma.employeeTask.create({
    data: (() => {
      const dueDate = new Date(parsed.data.dueDate);

      return {
        title: parsed.data.title,
        note: parsed.data.note || null,
        assignedToId: parsed.data.assignedToId,
        createdById: session.user.id,
        weekStartDate: startOfWeek(dueDate, { weekStartsOn: 1 }),
        dueDate,
        priority: parsed.data.priority,
        category: parsed.data.category,
        estimatedHours: parsed.data.estimatedHours,
        status: parsed.data.status,
        clientId: parsed.data.clientId || null,
      };
    })(),
    include: {
      assignedTo: {
        select: { id: true, name: true },
      },
      client: {
        select: { id: true, companyName: true },
      },
    },
  });

  await logActivity({
    actorId: session.user.id,
    action: `Assigned "${task.title}" to ${task.assignedTo.name}`,
    entityType: ActivityEntityType.EMPLOYEE_TASK,
    entityId: task.id,
    metadataJson: {
      assigneeId: task.assignedTo.id,
      clientId: task.client?.id ?? null,
    },
  });

  return NextResponse.json(task, { status: 201 });
}
