import type { Prisma } from "@prisma/client";

import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Reading tasks, scoped to what the person looking at them is allowed to see.
 *
 * The scope is built here rather than in the page so every caller - the screen,
 * the CSV export, the drawer - gets the same answer to "whose work is this".
 * A filter built twice is a filter that disagrees with itself eventually, and
 * the disagreeing copy is the one that leaks.
 */

/** What a task row carries into the list and the drawer. */
export const TASK_LIST_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  category: true,
  platform: true,
  recurrence: true,
  dueDate: true,
  startDate: true,
  createdAt: true,
  submittedAt: true,
  completedAt: true,
  approvedAt: true,
  archivedAt: true,
  estimatedHours: true,
  actualHours: true,
  requiresApproval: true,
  objective: true,
  completionCriteria: true,
  note: true,
  kpi: true,
  blocker: true,
  requiredAssets: true,
  revisionNote: true,
  evidenceUrl: true,
  client: { select: { id: true, companyName: true } },
  project: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, teamRole: true } },
  createdBy: { select: { id: true, name: true } },
  reviewer: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.EmployeeTaskSelect;

export type TaskListRow = Prisma.EmployeeTaskGetPayload<{
  select: typeof TASK_LIST_SELECT;
}>;

/**
 * The tasks one person is allowed to see.
 *
 * Sight of everything is a permission that delivery leads hold. Without it the
 * scope is the work you are doing, the work you asked somebody for, and the
 * work you were named to review. A specialist therefore never sees an account
 * they are not on, which is the rule, not a nicety.
 */
export function taskScopeFor(actor: AuthContext): Prisma.EmployeeTaskWhereInput {
  if (can(actor, "workItems.view.all")) {
    return { deletedAt: null };
  }

  return {
    deletedAt: null,
    OR: [
      { assignedToId: actor.id },
      { createdById: actor.id },
      { reviewerId: actor.id },
    ],
  };
}

/**
 * Everything on this person's plate, in one read.
 *
 * Capped rather than unbounded. The screen paginates what it is given, and a
 * seat with more than this much open work has a problem no page size fixes -
 * but the cap means the page still renders while somebody sorts that out.
 */
const MAX_ROWS = 500;

export async function getAssignedTasks(actor: AuthContext) {
  const [tasks, clients, reviewers] = await Promise.all([
    prisma.employeeTask.findMany({
      where: taskScopeFor(actor),
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: MAX_ROWS,
      select: TASK_LIST_SELECT,
    }),
    // Only the accounts that actually appear in this person's work, so the
    // client filter never names an account they cannot otherwise see.
    prisma.client.findMany({
      where: { deletedAt: null, agencyTasks: { some: taskScopeFor(actor) } },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, teamRole: true },
    }),
  ]);

  return { tasks, clients, reviewers, capped: tasks.length === MAX_ROWS };
}

/** Comments on a task, oldest first, the way a conversation reads. */
export async function getTaskComments(taskId: string) {
  return prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      isRevisionNote: true,
      createdAt: true,
      author: { select: { id: true, name: true, teamRole: true, role: true } },
    },
  });
}

/** The audit trail for a task, newest first. */
export async function getTaskActivity(taskId: string) {
  return prisma.activityLog.findMany({
    where: { entityType: "EMPLOYEE_TASK", entityId: taskId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      fieldName: true,
      previousValue: true,
      newValue: true,
      createdAt: true,
      actor: { select: { id: true, name: true, teamRole: true } },
    },
  });
}
