import { ActivityEntityType } from "@prisma/client";
import { startOfWeek } from "date-fns";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { canManageEmployeeTasks } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { employeeTaskFormSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * How long two identical submissions are treated as one.
 *
 * A double-click, an impatient second press, a flaky connection retried - all
 * land inside a few seconds. Beyond that, somebody deliberately assigning the
 * same work twice is a legitimate thing to do and should be allowed.
 */
const DEDUPE_WINDOW_MS = 30_000;

function optional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid task details" },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const [assignee, client, reviewer, project] = await Promise.all([
    prisma.user.findFirst({
      where: { id: data.assignedToId, deletedAt: null },
      select: { id: true, name: true },
    }),
    data.clientId
      ? prisma.client.findFirst({
          where: { id: data.clientId, deletedAt: null },
          select: { id: true, companyName: true },
        })
      : Promise.resolve(null),
    data.reviewerId
      ? prisma.user.findFirst({
          where: { id: data.reviewerId, deletedAt: null },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    data.projectId
      ? prisma.project.findFirst({
          where: { id: data.projectId, deletedAt: null },
          select: { id: true, name: true, clientId: true },
        })
      : Promise.resolve(null),
  ]);

  if (!assignee) {
    return NextResponse.json({ error: "That team member could not be found." }, { status: 404 });
  }

  if (data.clientId && !client) {
    return NextResponse.json({ error: "That client could not be found." }, { status: 404 });
  }

  if (data.reviewerId && !reviewer) {
    return NextResponse.json({ error: "That reviewer could not be found." }, { status: 404 });
  }

  // A campaign belonging to a different client would put the task on two
  // accounts at once, which is how work goes missing.
  if (project && client && project.clientId !== client.id) {
    return NextResponse.json(
      { error: "That campaign belongs to a different client." },
      { status: 400 },
    );
  }

  const dueDate = new Date(data.dueDate);

  if (Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
  }

  const startDate = data.startDate ? new Date(data.startDate) : null;

  if (startDate && Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
  }

  if (startDate && startDate.getTime() > dueDate.getTime()) {
    return NextResponse.json(
      { error: "The start date cannot be after the due date." },
      { status: 400 },
    );
  }

  /*
   * Two presses of the button must not make two tasks.
   *
   * Matched on the things that identify a submission rather than on a stored
   * key, so it works even when the browser retries without the form knowing.
   * Deliberately narrow: same title, same person, same due date, moments ago.
   */
  const duplicate = await prisma.employeeTask.findFirst({
    where: {
      title: data.title.trim(),
      assignedToId: assignee.id,
      dueDate,
      createdById: session.user.id,
      deletedAt: null,
      createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
    select: { id: true },
  });

  if (duplicate) {
    return NextResponse.json(
      { ok: true, taskId: duplicate.id, deduplicated: true },
      { status: 200 },
    );
  }

  const task = await prisma.employeeTask.create({
    data: {
      title: data.title.trim(),
      note: optional(data.note),
      assignedToId: assignee.id,
      createdById: session.user.id,
      weekStartDate: startOfWeek(dueDate, { weekStartsOn: 1 }),
      dueDate,
      startDate,
      priority: data.priority,
      category: data.category,
      estimatedHours: data.estimatedHours,
      status: data.status,
      clientId: client?.id ?? null,
      projectId: project?.id ?? null,
      reviewerId: reviewer?.id ?? null,
      platform: data.platform ?? null,
      objective: optional(data.objective),
      completionCriteria: optional(data.completionCriteria),
      requiredAssets: optional(data.requiredAssets),
      kpi: optional(data.kpi),
      blocker: optional(data.blocker),
      recurrence: data.recurrence ?? "NONE",
      // A reviewer named on the task is a request for review, not decoration.
      requiresApproval: Boolean(reviewer),
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
      client: { select: { id: true, companyName: true } },
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
      category: task.category,
      platform: task.platform,
      reviewerId: task.reviewerId,
      recurrence: task.recurrence,
    },
  });

  // The person doing it, and the person checking it, both need to know.
  await createNotifications(
    resolveRecipients([assignee.id, reviewer?.id ?? null], session.user.id).map(
      (recipientId) => ({
        recipientId,
        type: "TASK_ASSIGNED" as const,
        urgency: data.priority === "CRITICAL" || data.priority === "URGENT"
          ? ("HIGH" as const)
          : ("NORMAL" as const),
        title:
          recipientId === reviewer?.id
            ? `You are reviewing: ${task.title}`
            : `New task: ${task.title}`,
        body: client ? `For ${client.companyName}.` : "Internal work.",
        entityType: "EMPLOYEE_TASK" as const,
        entityId: task.id,
        href: "/work",
      }),
    ),
  );

  return NextResponse.json({ ok: true, taskId: task.id, task }, { status: 201 });
}
