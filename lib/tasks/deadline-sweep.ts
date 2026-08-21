import { endOfDay, startOfDay } from "date-fns";

import { createNotifications, type NotificationInput } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES } from "@/lib/tasks/task-catalogue";

/**
 * The nightly deadline sweep.
 *
 * A task becoming overdue is the one thing in this system that nobody does.
 * Every other notification is raised by somebody acting - assigning work,
 * approving a report, removing access - and a deadline passing is just time
 * going by, so without something on a schedule it is never announced. The
 * result was a dashboard showing twenty-one overdue tasks while the bell had
 * never mentioned a single one.
 *
 * Notifies the person the work belongs to, and only them. Fanning these out to
 * whoever holds oversight would put twenty-one rows a night on four accounts,
 * which is how a notification list stops being read - and the project manager
 * dashboard already lists everybody's overdue work on the page itself.
 */

/** Matches the three-day window the My Work summary already uses. */
const DUE_SOON_DAYS = 3;

export interface DeadlineSweepResult {
  overdueFound: number;
  dueSoonFound: number;
  notificationsCreated: number;
  skippedAlreadyTold: number;
}

interface SweepTask {
  id: string;
  title: string;
  dueDate: Date | null;
  assignedToId: string;
  client: { companyName: string } | null;
}

/**
 * Has this person already been told about this task, for this deadline?
 *
 * Keyed on the notification being newer than the due date it is about, which
 * is what makes a rescheduled task speak up again: move the date forward and
 * the old notification now predates it, so the next sweep treats the new
 * deadline as something the assignee has not heard about.
 *
 * The unread-only dedup inside createNotifications is not enough on its own
 * here. It suppresses a duplicate only while the first one sits unread, so a
 * task that stays overdue would be re-announced every night to anybody
 * conscientious enough to have read the first one.
 */
function alreadyTold(
  told: Map<string, Date>,
  task: SweepTask,
  type: "TASK_OVERDUE" | "TASK_DUE_SOON",
) {
  const seenAt = told.get(`${task.assignedToId}|${type}|${task.id}`);

  if (!seenAt || !task.dueDate) {
    return Boolean(seenAt);
  }

  return seenAt >= task.dueDate;
}

function describe(task: SweepTask) {
  return task.client ? `${task.title} · ${task.client.companyName}` : task.title;
}

export async function runDeadlineSweep(now = new Date()): Promise<DeadlineSweepResult> {
  const dayStart = startOfDay(now);
  const soonLimit = endOfDay(new Date(dayStart.getTime() + DUE_SOON_DAYS * 86_400_000));

  const candidates = await prisma.employeeTask.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      status: { in: OPEN_STATUSES },
      // lte already excludes nulls: a null due date satisfies no comparison.
      dueDate: { lte: soonLimit },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      assignedToId: true,
      client: { select: { companyName: true } },
    },
  });

  if (!candidates.length) {
    return {
      overdueFound: 0,
      dueSoonFound: 0,
      notificationsCreated: 0,
      skippedAlreadyTold: 0,
    };
  }

  // One query for everything already said about these tasks, rather than one
  // per task - a sweep over a few hundred rows should not be a few hundred
  // round trips.
  const previous = await prisma.notification.findMany({
    where: {
      type: { in: ["TASK_OVERDUE", "TASK_DUE_SOON"] },
      entityId: { in: candidates.map((task) => task.id) },
    },
    select: { recipientId: true, type: true, entityId: true, createdAt: true },
  });

  const told = new Map<string, Date>();

  for (const row of previous) {
    const key = `${row.recipientId}|${row.type}|${row.entityId}`;
    const seen = told.get(key);

    if (!seen || row.createdAt > seen) {
      told.set(key, row.createdAt);
    }
  }

  const inputs: NotificationInput[] = [];
  let overdueFound = 0;
  let dueSoonFound = 0;
  let skippedAlreadyTold = 0;

  for (const task of candidates) {
    if (!task.dueDate) continue;

    const isOverdue = task.dueDate < dayStart;
    const type = isOverdue ? "TASK_OVERDUE" : "TASK_DUE_SOON";

    if (isOverdue) overdueFound += 1;
    else dueSoonFound += 1;

    if (alreadyTold(told, task, type)) {
      skippedAlreadyTold += 1;
      continue;
    }

    inputs.push({
      recipientId: task.assignedToId,
      type,
      urgency: "NORMAL",
      title: isOverdue ? `Overdue: ${task.title}` : `Due soon: ${task.title}`,
      body: isOverdue
        ? `${describe(task)} passed its due date.`
        : `${describe(task)} is due within ${DUE_SOON_DAYS} days.`,
      entityType: "EMPLOYEE_TASK",
      entityId: task.id,
      href: `/work?task=${task.id}`,
    });
  }

  const notificationsCreated = inputs.length ? await createNotifications(inputs) : 0;

  return { overdueFound, dueSoonFound, notificationsCreated, skippedAlreadyTold };
}
