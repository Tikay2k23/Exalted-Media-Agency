import type { EmployeeTaskStatus } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

// The rules about which tasks owe an entry live apart, so the browser can read
// them without the database driver coming too. Re-exported for existing callers.
export {
  EOD_REQUIRED_STATUSES,
  requiresEodOn,
  type EodCandidateTask,
} from "./eod-rules";

import { startOfDay } from "./eod-rules";

/**
 * End-of-day entries.
 *
 * One rule shapes this whole file: the person who did the work writes the
 * entry. A manager can read every entry, chase a missing one and attach a note
 * to the week, but cannot type into somebody else's account of their own day -
 * a report a manager can quietly rewrite is not a report, it is a manager's
 * opinion with somebody else's name on it.
 */

export type EodFailureCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "NOT_REQUIRED";

export interface EodFailure {
  ok: false;
  code: EodFailureCode;
  message: string;
}

function failure(code: EodFailureCode, message: string): EodFailure {
  return { ok: false, code, message };
}

export const EOD_FAILURE_STATUS: Record<EodFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  NOT_REQUIRED: 409,
};

export interface EodInput {
  summary: string;
  nextSteps: string;
  progressPercent?: number | null;
  hoursSpent?: number | null;
  blockers?: string | null;
  workLink?: string | null;
  taskStatus?: EmployeeTaskStatus | null;
  supportNeeded?: string | null;
  entryDate?: string | null;
}

/**
 * Writing today's entry, or correcting it.
 *
 * Upserted on (task, author, date), which is what makes a second submission an
 * edit rather than a duplicate. The original is not kept as a separate row -
 * correcting a typo an hour later should not read as two days of work - but
 * createdAt stays put while updatedAt moves, so the fact that it was revised is
 * still on the record, and the activity log keeps both events.
 */
export async function submitEod(input: {
  actor: AuthContext;
  taskId: string;
  entry: EodInput;
}) {
  const { actor, taskId, entry } = input;

  const task = await prisma.employeeTask.findFirst({
    where: { id: taskId, deletedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      dueDate: true,
      archivedAt: true,
      assignedToId: true,
      clientId: true,
      client: { select: { id: true, companyName: true } },
    },
  });

  if (!task) return failure("NOT_FOUND", "That task could not be found.");

  /*
   * The entry belongs to the person doing the work. Not "anyone who can edit
   * the task" - that would let a project manager file somebody's day for them,
   * and the whole point of a daily entry is that it is first-hand.
   */
  if (task.assignedToId !== actor.id) {
    return failure(
      "FORBIDDEN",
      "Only the person doing this work can write its end-of-day entry.",
    );
  }

  if (task.archivedAt) {
    return failure("INVALID", "This task is archived.");
  }

  const summary = entry.summary.trim();
  const nextSteps = entry.nextSteps.trim();

  if (!summary) return failure("INVALID", "Say what moved forward today.");
  if (!nextSteps) return failure("INVALID", "Say what happens next.");

  const blockers = entry.blockers?.trim() || null;

  // A task parked as blocked with no reason is one nobody can unblock.
  if ((entry.taskStatus ?? task.status) === "BLOCKED" && !blockers) {
    return failure("INVALID", "Say what is blocking it, or it cannot be chased.");
  }

  const progressPercent =
    typeof entry.progressPercent === "number"
      ? Math.min(100, Math.max(0, Math.round(entry.progressPercent)))
      : null;

  const hoursSpent =
    typeof entry.hoursSpent === "number" && Number.isFinite(entry.hoursSpent)
      ? Math.min(24, Math.max(0, entry.hoursSpent))
      : null;

  const entryDate = startOfDay(entry.entryDate ? new Date(entry.entryDate) : new Date());

  if (Number.isNaN(entryDate.getTime())) {
    return failure("INVALID", "That is not a date.");
  }

  // Backdating is fine; filing tomorrow's work today is not.
  if (entryDate > startOfDay(new Date())) {
    return failure("INVALID", "You cannot file an entry for a day that has not happened.");
  }

  const existing = await prisma.employeeTaskEodEntry.findUnique({
    where: {
      taskId_authorId_entryDate: { taskId: task.id, authorId: actor.id, entryDate },
    },
    select: { id: true },
  });

  const data = {
    summary,
    nextSteps,
    blockers,
    progressPercent,
    hoursSpent,
    workLink: entry.workLink?.trim() || null,
    supportNeeded: entry.supportNeeded?.trim() || null,
    taskStatus: entry.taskStatus ?? task.status,
  };

  const saved = await prisma.employeeTaskEodEntry.upsert({
    where: {
      taskId_authorId_entryDate: { taskId: task.id, authorId: actor.id, entryDate },
    },
    update: data,
    create: { taskId: task.id, authorId: actor.id, entryDate, ...data },
    select: {
      id: true,
      entryDate: true,
      summary: true,
      nextSteps: true,
      blockers: true,
      progressPercent: true,
      hoursSpent: true,
      workLink: true,
      taskStatus: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, name: true } },
    },
  });

  /*
   * The status the person reported is applied to the task, so the board and the
   * entry cannot disagree about where the work stands. Approved and done are
   * excluded: finishing goes through review, and a status dropdown inside an
   * EOD form must not become a way around it.
   */
  if (
    entry.taskStatus
    && entry.taskStatus !== task.status
    && !["APPROVED", "DONE", "CANCELLED"].includes(entry.taskStatus)
  ) {
    await prisma.employeeTask.update({
      where: { id: task.id },
      data: {
        status: entry.taskStatus,
        blocker: entry.taskStatus === "BLOCKED" ? blockers : null,
      },
    });
  }

  await logActivity({
    actorId: actor.id,
    action: existing
      ? `Updated EOD for "${task.title}"`
      : `Submitted EOD for "${task.title}"`,
    entityType: "EMPLOYEE_TASK",
    entityId: task.id,
    metadataJson: {
      entryDate: entryDate.toISOString(),
      progressPercent,
      hoursSpent,
      clientId: task.clientId,
      revised: Boolean(existing),
    },
  });

  return { ok: true as const, entry: saved, revised: Boolean(existing) };
}

/**
 * Every entry on a task, oldest first.
 *
 * Chronological because the useful thing about a run of them is the direction
 * of travel: thirty percent, fifty-five, seventy-five is a story, and the same
 * three numbers backwards is a different one.
 */
export async function getTaskEodHistory(taskId: string) {
  return prisma.employeeTaskEodEntry.findMany({
    where: { taskId },
    orderBy: { entryDate: "asc" },
    select: {
      id: true,
      entryDate: true,
      summary: true,
      nextSteps: true,
      blockers: true,
      progressPercent: true,
      hoursSpent: true,
      workLink: true,
      taskStatus: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, name: true } },
    },
  });
}

/** Whether somebody may read another person's entries. */
export function canSeeTeamEod(actor: AuthContext) {
  return can(actor, "workItems.view.all") || can(actor, "team.view");
}
