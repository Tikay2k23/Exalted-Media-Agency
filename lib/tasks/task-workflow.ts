import type { EmployeeTaskStatus } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Moving one piece of work through its life.
 *
 * The rule this file exists to enforce: the person who did the work is not the
 * person who signs it off. Everything else here is bookkeeping around that.
 * The route handlers call these functions and format the answer; none of them
 * write task status themselves, so there is one place where the rule lives and
 * one place to change it.
 */

export type TaskFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "SELF_APPROVAL"
  | "NOTE_REQUIRED";

export interface TaskFailure {
  ok: false;
  code: TaskFailureCode;
  message: string;
}

function failure(code: TaskFailureCode, message: string): TaskFailure {
  return { ok: false, code, message };
}

export const TASK_FAILURE_STATUS: Record<TaskFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  SELF_APPROVAL: 409,
  NOTE_REQUIRED: 422,
};

const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  assignedToId: true,
  createdById: true,
  reviewerId: true,
  clientId: true,
  requiresApproval: true,
  archivedAt: true,
  actualHours: true,
  estimatedHours: true,
  approvedById: true,
  client: { select: { id: true, companyName: true } },
} as const;

type TaskRow = {
  id: string;
  title: string;
  status: EmployeeTaskStatus;
  assignedToId: string;
  createdById: string | null;
  reviewerId: string | null;
  clientId: string | null;
  requiresApproval: boolean;
  archivedAt: Date | null;
  actualHours: number | null;
  estimatedHours: number;
  approvedById: string | null;
  client: { id: string; companyName: string } | null;
};

/**
 * Statuses the person doing the work may set themselves.
 *
 * Review and approval are missing on purpose - those go through
 * submitForReview and review, which record who did it and when. Letting a
 * status dropdown reach APPROVED would leave an approved task with no approver
 * against it, which is the same as no approval at all.
 */
const SELF_SERVE_STATUSES: EmployeeTaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "BLOCKED",
];

/** Statuses a piece of work can be submitted for review from. */
const SUBMITTABLE_STATUSES: EmployeeTaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "BLOCKED",
  "REVISION_REQUIRED",
];

/** Work that is over, whatever the ending was. */
const FINISHED_STATUSES: EmployeeTaskStatus[] = ["APPROVED", "DONE", "CANCELLED"];

/**
 * Whether somebody may look at this task at all.
 *
 * Sight of everything is a permission. Without it you see the work you are
 * doing, the work you asked for, and the work you were named to review -
 * nothing about accounts you are not on.
 */
export function canViewTask(
  actor: AuthContext,
  task: Pick<TaskRow, "assignedToId" | "createdById" | "reviewerId">,
) {
  if (can(actor, "workItems.view.all")) return true;

  return (
    task.assignedToId === actor.id
    || task.createdById === actor.id
    || task.reviewerId === actor.id
  );
}

/**
 * Whether somebody may decide this task is finished.
 *
 * Two conditions, both required. They must have the standing - named reviewer,
 * or the blanket permission - and they must not be the person who did it.
 * Being the agency owner does not exempt anybody: an owner who assigned the
 * task to themselves still cannot be its approver, because there is nobody
 * else in that transaction and "reviewed" would mean nothing.
 */
export function canReviewTask(actor: AuthContext, task: Pick<TaskRow, "assignedToId" | "reviewerId">) {
  if (task.assignedToId === actor.id) return false;

  return task.reviewerId === actor.id || can(actor, "workItems.review");
}

async function loadTask(taskId: string): Promise<TaskRow | null> {
  return prisma.employeeTask.findFirst({
    where: { id: taskId, deletedAt: null },
    select: TASK_SELECT,
  });
}

/**
 * A status change the assignee makes as they work.
 *
 * Deliberately narrow. Picking up a task, parking it on the client, flagging it
 * blocked - the states somebody moves through during a day. Finishing is not
 * one of them when a reviewer is waiting.
 */
export async function changeTaskStatus(input: {
  actor: AuthContext;
  taskId: string;
  status: EmployeeTaskStatus;
  actualHours?: number | null;
}) {
  const { actor, taskId, status } = input;
  const task = await loadTask(taskId);

  if (!task) return failure("NOT_FOUND", "That task could not be found.");
  if (!canViewTask(actor, task)) return failure("NOT_FOUND", "That task could not be found.");

  const isAssignee = task.assignedToId === actor.id;
  const canEdit = can(actor, "workItems.edit");

  if (!isAssignee && !canEdit) {
    return failure("FORBIDDEN", "Only the person doing this work can change its status.");
  }

  if (task.archivedAt) {
    return failure("INVALID", "This task is archived. Restore it before changing anything.");
  }

  // Nobody reaches approved through a dropdown. It is a decision with a name
  // attached, and it goes through review.
  if (status === "APPROVED") {
    return failure(
      "INVALID",
      "Approving is done from the review panel, so the approval has a name against it.",
    );
  }

  if (status === "NEEDS_REVIEW") {
    return failure("INVALID", "Use Submit for review, so the handover is recorded.");
  }

  // Marking your own work done when somebody is waiting to check it is exactly
  // the shortcut the review step exists to prevent.
  if (status === "DONE" && task.requiresApproval && isAssignee) {
    return failure(
      "SELF_APPROVAL",
      "This task has a reviewer. Submit it for review rather than closing it yourself.",
    );
  }

  if (isAssignee && !canEdit && !SELF_SERVE_STATUSES.includes(status) && status !== "DONE") {
    return failure("FORBIDDEN", "That status is not yours to set.");
  }

  const finishing = status === "DONE" || status === "CANCELLED";

  const updated = await prisma.employeeTask.update({
    where: { id: task.id },
    data: {
      status,
      actualHours: input.actualHours ?? task.actualHours,
      completedAt: finishing ? new Date() : null,
      // Coming back off a finished state means the work is live again.
      ...(finishing ? {} : { submittedAt: null }),
    },
    select: TASK_SELECT,
  });

  await logActivity({
    actorId: actor.id,
    action: `Moved "${task.title}" to ${status.replaceAll("_", " ").toLowerCase()}`,
    entityType: "EMPLOYEE_TASK",
    entityId: task.id,
    fieldName: "status",
    previousValue: task.status,
    newValue: status,
  });

  return { ok: true as const, task: updated };
}

/**
 * Handing the work over to be checked.
 *
 * Actual hours are collected here because this is the moment somebody knows
 * them and is thinking about the task. Asked for later, they are a guess.
 */
export async function submitForReview(input: {
  actor: AuthContext;
  taskId: string;
  actualHours?: number | null;
  note?: string | null;
}) {
  const { actor, taskId } = input;
  const task = await loadTask(taskId);

  if (!task) return failure("NOT_FOUND", "That task could not be found.");
  if (!canViewTask(actor, task)) return failure("NOT_FOUND", "That task could not be found.");

  if (task.assignedToId !== actor.id && !can(actor, "workItems.edit")) {
    return failure("FORBIDDEN", "Only the person doing this work can submit it.");
  }

  if (task.archivedAt) {
    return failure("INVALID", "This task is archived.");
  }

  if (!SUBMITTABLE_STATUSES.includes(task.status)) {
    return failure(
      "INVALID",
      task.status === "NEEDS_REVIEW"
        ? "This is already waiting for review."
        : "Finished work cannot be submitted again.",
    );
  }

  const actualHours =
    typeof input.actualHours === "number" && Number.isFinite(input.actualHours)
      ? Math.max(0, Math.round(input.actualHours))
      : task.actualHours;

  const updated = await prisma.employeeTask.update({
    where: { id: task.id },
    data: {
      status: "NEEDS_REVIEW",
      submittedAt: new Date(),
      actualHours,
      // The previous reviewer's objection has been answered. Keep it on the
      // thread, take it off the task.
      revisionNote: null,
    },
    select: TASK_SELECT,
  });

  if (input.note?.trim()) {
    await prisma.taskComment.create({
      data: { taskId: task.id, authorId: actor.id, body: input.note.trim() },
    });
  }

  await logActivity({
    actorId: actor.id,
    action: `Submitted "${task.title}" for review`,
    entityType: "EMPLOYEE_TASK",
    entityId: task.id,
    fieldName: "status",
    previousValue: task.status,
    newValue: "NEEDS_REVIEW",
    metadataJson: { actualHours },
  });

  // Somebody has to know it is waiting, or it waits forever.
  await createNotifications(
    resolveRecipients([task.reviewerId, task.createdById], actor.id).map((recipientId) => ({
      recipientId,
      type: "APPROVAL_REQUIRED" as const,
      urgency: "NORMAL" as const,
      title: `Ready for review: ${task.title}`,
      body: task.client ? `For ${task.client.companyName}.` : "Internal work.",
      entityType: "EMPLOYEE_TASK" as const,
      entityId: task.id,
      href: "/work",
    })),
  );

  return { ok: true as const, task: updated };
}

/**
 * The reviewer's decision.
 *
 * Approving records who and when, and closes the task in the same write, so
 * there is never a gap where something is approved but not finished. Sending it
 * back requires a reason: "needs work" tells the assignee nothing, and a
 * revision nobody can act on comes straight back.
 */
export async function reviewTask(input: {
  actor: AuthContext;
  taskId: string;
  decision: "APPROVE" | "REQUEST_REVISION";
  note?: string | null;
}) {
  const { actor, taskId, decision } = input;
  const task = await loadTask(taskId);

  if (!task) return failure("NOT_FOUND", "That task could not be found.");
  if (!canViewTask(actor, task)) return failure("NOT_FOUND", "That task could not be found.");

  if (task.assignedToId === actor.id) {
    return failure(
      "SELF_APPROVAL",
      "You did this work, so you cannot be the one who signs it off. Someone else has to look.",
    );
  }

  if (!canReviewTask(actor, task)) {
    return failure("FORBIDDEN", "You are not the reviewer on this task.");
  }

  if (task.archivedAt) {
    return failure("INVALID", "This task is archived.");
  }

  if (task.status !== "NEEDS_REVIEW") {
    return failure("INVALID", "This task has not been submitted for review.");
  }

  const note = input.note?.trim() ?? "";

  if (decision === "REQUEST_REVISION" && !note) {
    return failure(
      "NOTE_REQUIRED",
      "Say what needs changing. A revision with no reason comes straight back.",
    );
  }

  const now = new Date();

  const updated = await prisma.employeeTask.update({
    where: { id: task.id },
    data:
      decision === "APPROVE"
        ? {
            // Approved and done together. The two timestamps stay separate
            // because the report needs both, but the work is over either way.
            status: "DONE",
            approvedById: actor.id,
            approvedAt: now,
            completedAt: now,
            revisionNote: null,
          }
        : {
            status: "REVISION_REQUIRED",
            revisionNote: note,
            submittedAt: null,
          },
    select: TASK_SELECT,
  });

  if (note) {
    await prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId: actor.id,
        body: note,
        isRevisionNote: decision === "REQUEST_REVISION",
      },
    });
  }

  await logActivity({
    actorId: actor.id,
    action:
      decision === "APPROVE"
        ? `Approved "${task.title}"`
        : `Requested changes to "${task.title}"`,
    entityType: "EMPLOYEE_TASK",
    entityId: task.id,
    fieldName: "status",
    previousValue: "NEEDS_REVIEW",
    newValue: updated.status,
    metadataJson: { decision, note: note || null },
  });

  await createNotifications(
    resolveRecipients([task.assignedToId], actor.id).map((recipientId) => ({
      recipientId,
      type: decision === "APPROVE" ? ("APPROVAL_RECEIVED" as const) : ("REVISION_REQUEST" as const),
      urgency: decision === "APPROVE" ? ("LOW" as const) : ("HIGH" as const),
      title:
        decision === "APPROVE"
          ? `Approved: ${task.title}`
          : `Changes requested: ${task.title}`,
      body: decision === "APPROVE" ? "Nothing more needed." : note,
      entityType: "EMPLOYEE_TASK" as const,
      entityId: task.id,
      href: "/work",
    })),
  );

  return { ok: true as const, task: updated };
}

/**
 * Off the board, still in the record.
 *
 * Only finished work can be archived. Archiving something live would hide it
 * from the person doing it, which is the failure mode this whole screen exists
 * to prevent.
 */
export async function archiveTask(input: {
  actor: AuthContext;
  taskId: string;
  archived: boolean;
}) {
  const { actor, taskId, archived } = input;
  const task = await loadTask(taskId);

  if (!task) return failure("NOT_FOUND", "That task could not be found.");

  if (!can(actor, "workItems.archive")) {
    return failure("FORBIDDEN", "Archiving is for the people who run delivery.");
  }

  if (archived && !FINISHED_STATUSES.includes(task.status)) {
    return failure(
      "INVALID",
      "Only finished work can be archived. This is still live, and archiving it would hide it from whoever is doing it.",
    );
  }

  const updated = await prisma.employeeTask.update({
    where: { id: task.id },
    data: {
      archivedAt: archived ? new Date() : null,
      archivedById: archived ? actor.id : null,
    },
    select: TASK_SELECT,
  });

  await logActivity({
    actorId: actor.id,
    action: archived ? `Archived "${task.title}"` : `Restored "${task.title}" from the archive`,
    entityType: "EMPLOYEE_TASK",
    entityId: task.id,
    fieldName: "archivedAt",
    previousValue: task.archivedAt?.toISOString() ?? null,
    newValue: updated.archivedAt?.toISOString() ?? null,
  });

  return { ok: true as const, task: updated };
}

/**
 * Gone for good.
 *
 * Two gates, because this is the one action with no undo: the permission, which
 * only the owner tier holds, and the archive, which forces a deliberate step
 * first. Nothing reaches this from the active board.
 */
export async function deleteTaskPermanently(input: { actor: AuthContext; taskId: string }) {
  const { actor, taskId } = input;
  const task = await loadTask(taskId);

  if (!task) return failure("NOT_FOUND", "That task could not be found.");

  if (!can(actor, "workItems.delete")) {
    return failure("FORBIDDEN", "Only the agency owner can permanently delete a task.");
  }

  if (!task.archivedAt) {
    return failure(
      "INVALID",
      "Archive it first. Nothing is deleted straight off the board.",
    );
  }

  // Written before the row goes, so the trail outlives the task. The activity
  // log has no delete counterpart by design.
  await logActivity({
    actorId: actor.id,
    action: `Permanently deleted "${task.title}"`,
    entityType: "EMPLOYEE_TASK",
    entityId: task.id,
    metadataJson: {
      title: task.title,
      clientId: task.clientId,
      status: task.status,
      assignedToId: task.assignedToId,
    },
  });

  await prisma.employeeTask.delete({ where: { id: task.id } });

  return { ok: true as const, taskId: task.id };
}

/** A comment on the task, from anyone who can see the task. */
export async function addTaskComment(input: {
  actor: AuthContext;
  taskId: string;
  body: string;
}) {
  const { actor, taskId } = input;
  const body = input.body.trim();

  if (!body) return failure("INVALID", "A comment needs something in it.");

  const task = await loadTask(taskId);

  if (!task) return failure("NOT_FOUND", "That task could not be found.");
  if (!canViewTask(actor, task)) return failure("NOT_FOUND", "That task could not be found.");

  const comment = await prisma.taskComment.create({
    data: { taskId: task.id, authorId: actor.id, body },
    select: {
      id: true,
      body: true,
      isRevisionNote: true,
      createdAt: true,
      author: { select: { id: true, name: true, teamRole: true } },
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Commented on "${task.title}"`,
    entityType: "EMPLOYEE_TASK",
    entityId: task.id,
  });

  // Everybody with a stake in the task, minus whoever just typed it.
  await createNotifications(
    resolveRecipients(
      [task.assignedToId, task.reviewerId, task.createdById],
      actor.id,
    ).map((recipientId) => ({
      recipientId,
      type: "TASK_ASSIGNED" as const,
      urgency: "LOW" as const,
      title: `New comment on ${task.title}`,
      body: body.length > 140 ? `${body.slice(0, 137)}...` : body,
      entityType: "EMPLOYEE_TASK" as const,
      entityId: task.id,
      href: "/work",
    })),
  );

  return { ok: true as const, comment };
}
