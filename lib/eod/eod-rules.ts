import type { EmployeeTaskStatus } from "@prisma/client";

/**
 * Which tasks owed an entry, and when.
 *
 * Pure, and in its own file because the manager's board runs it in the browser -
 * anything this imports ships with it, and beside the database service it
 * dragged the Postgres driver into the client bundle.
 */

/**
 * Statuses that mean somebody was expected to touch this today.
 *
 * Deliberately not "every task in the database". Asking for an entry on
 * something in the backlog trains people to write "no update" forty times a
 * week, and once that habit forms the entries stop meaning anything.
 *
 * Revision required is in the list because being sent back is exactly when a
 * manager wants to know what happened. Waiting and blocked are in it because
 * "still waiting on the same thing" is useful information, and its absence for
 * three days is the signal that something has been dropped.
 */
export const EOD_REQUIRED_STATUSES: EmployeeTaskStatus[] = [
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "BLOCKED",
  "REVISION_REQUIRED",
];

/** Work that is over, or was never today's problem. */
const EOD_EXEMPT_STATUSES: EmployeeTaskStatus[] = [
  "BACKLOG",
  "APPROVED",
  "DONE",
  "CANCELLED",
];

export interface EodCandidateTask {
  id: string;
  status: EmployeeTaskStatus;
  startDate: Date | null;
  dueDate: Date;
  archivedAt: Date | null;
  deletedAt?: Date | null;
}

/**
 * Whether this task needed an entry on this day.
 *
 * The four active statuses always do. A to-do task does once its start date has
 * arrived - somebody scheduled it to begin, so silence on it is worth noticing -
 * but not before, because nobody can report on work they were not due to start.
 */
export function requiresEodOn(task: EodCandidateTask, day: Date): boolean {
  if (task.archivedAt || task.deletedAt) return false;
  if (EOD_EXEMPT_STATUSES.includes(task.status)) return false;
  if (EOD_REQUIRED_STATUSES.includes(task.status)) return true;

  if (task.status === "TODO") {
    // Only once it was supposed to have started. Without a start date there is
    // nothing saying today was the day.
    if (!task.startDate) return false;
    return startOfDay(task.startDate) <= startOfDay(day);
  }

  // Needs review is the reviewer's move, not the assignee's. Chasing the person
  // who already handed it over would be asking them to report on waiting.
  return false;
}

export function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
