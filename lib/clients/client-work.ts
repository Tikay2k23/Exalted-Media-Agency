/**
 * What the Work tab knows, derived from the tasks that already exist.
 *
 * Nothing here queries and nothing here is stored. Every number on the page is
 * computed from the same EmployeeTask rows My Work, Weekly Work, the EOD
 * reports and the Journey summaries read, so a count on this page and a count
 * on that one cannot disagree - there is only ever one task record, and this
 * module is a way of looking at it rather than a copy of it.
 *
 * The one distinction worth protecting: "waiting on the client" and "blocked"
 * are different facts. One is the client's move and is chased by asking them;
 * the other is ours and is chased by fixing something. A metric that adds them
 * together tells a project manager to do the wrong thing.
 */

import { startOfDay } from "@/lib/tasks/task-filters";

/** Statuses that mean the work is finished, however it finished. */
export const CLOSED_TASK_STATUSES = ["APPROVED", "DONE", "CANCELLED"];

/** Statuses that still represent work somebody owes. */
export const OPEN_TASK_STATUSES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "BLOCKED",
  "NEEDS_REVIEW",
  "REVISION_REQUIRED",
];

/**
 * How near is "due soon".
 *
 * Three days, which is short enough that the card means "this week is at stake"
 * rather than "eventually". Overdue work is deliberately excluded: it has its
 * own card, and counting it twice makes the two cards add up to more work than
 * exists.
 */
export const DUE_SOON_DAYS = 3;

export interface WorkTask {
  id: string;
  title: string;
  note: string | null;
  status: string;
  priority: string;
  category: string;
  /** ISO. Every task has one - the schema requires it. */
  dueDate: string;
  startDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  assignee: { id: string; name: string; role: string | null } | null;
  reviewerId: string | null;
  projectId: string | null;
  projectName: string | null;
  /** The free-text reason recorded when somebody blocked it. */
  blocker: string | null;
  requiresApproval: boolean;
  /** ISO date of the most recent EOD entry, if any. */
  latestEodDate: string | null;
  /** Prerequisites that are not finished yet. */
  unmetDependencies: number;
}

export function isOpen(task: WorkTask) {
  return !task.archivedAt && OPEN_TASK_STATUSES.includes(task.status);
}

export function isClosed(task: WorkTask) {
  return CLOSED_TASK_STATUSES.includes(task.status);
}

export function isOverdue(task: WorkTask, now: Date) {
  return isOpen(task) && new Date(task.dueDate) < startOfDay(now);
}

export function isDueSoon(task: WorkTask, now: Date) {
  if (!isOpen(task) || isOverdue(task, now)) return false;

  const due = new Date(task.dueDate);
  const horizon = startOfDay(now);

  horizon.setDate(horizon.getDate() + DUE_SOON_DAYS + 1);

  return due < horizon;
}

function inCurrentMonth(value: string | null, now: Date) {
  if (!value) return false;

  const date = new Date(value);

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

/* -------------------------------------------------------------------------- */
/* The six cards                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Which slice of the table a card shows.
 *
 * The cards are the filters. Clicking one narrows the table below rather than
 * navigating somewhere else, so the number and the rows behind it can never be
 * two different questions.
 */
export type WorkMetricKey =
  | "active"
  | "dueSoon"
  | "overdue"
  | "blocked"
  | "needsReview"
  | "completedThisMonth";

export interface WorkMetric {
  key: WorkMetricKey;
  label: string;
  value: number;
  /** Shown under the number when it is worth saying what the number means. */
  caption: string;
}

export function matchesMetric(task: WorkTask, key: WorkMetricKey, now: Date): boolean {
  switch (key) {
    case "active":
      return isOpen(task);
    case "dueSoon":
      return isDueSoon(task, now);
    case "overdue":
      return isOverdue(task, now);
    case "blocked":
      return !task.archivedAt && task.status === "BLOCKED";
    case "needsReview":
      return !task.archivedAt && task.status === "NEEDS_REVIEW";
    case "completedThisMonth":
      return (
        (task.status === "DONE" || task.status === "APPROVED")
        && inCurrentMonth(task.completedAt, now)
      );
    default:
      return false;
  }
}

export function workMetrics(tasks: WorkTask[], now: Date): WorkMetric[] {
  const count = (key: WorkMetricKey) =>
    tasks.filter((task) => matchesMetric(task, key, now)).length;

  return [
    { key: "active", label: "Active Tasks", value: count("active"), caption: "View all" },
    {
      key: "dueSoon",
      label: "Due Soon",
      value: count("dueSoon"),
      caption: `Next ${DUE_SOON_DAYS} days`,
    },
    { key: "overdue", label: "Overdue", value: count("overdue"), caption: "View all" },
    { key: "blocked", label: "Blocked", value: count("blocked"), caption: "View all" },
    { key: "needsReview", label: "Needs Review", value: count("needsReview"), caption: "View all" },
    {
      key: "completedThisMonth",
      label: "Completed This Month",
      value: count("completedThisMonth"),
      caption: "View all",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* EOD                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Whether today's end-of-day update has arrived for a task.
 *
 * Only asked of work actually in progress. A task sitting in the backlog, or
 * waiting on a client, or already handed over for review is not work somebody
 * did today, and an amber clock beside it would be nagging for an update about
 * nothing.
 */
export type EodState = "submitted" | "expected" | "overdue" | "none";

export function eodState(task: WorkTask, now: Date): EodState {
  if (task.status !== "IN_PROGRESS" || task.archivedAt) return "none";

  if (!task.latestEodDate) {
    /*
     * Never updated. Overdue only once the task has had a day to produce one -
     * work picked up this morning has not missed anything yet.
     */
    const started = task.startDate ? new Date(task.startDate) : null;

    if (started && startOfDay(started).getTime() >= startOfDay(now).getTime()) {
      return "expected";
    }

    return started ? "overdue" : "expected";
  }

  const last = startOfDay(new Date(task.latestEodDate)).getTime();
  const today = startOfDay(now).getTime();

  if (last >= today) return "submitted";

  const daysMissed = Math.round((today - last) / 86_400_000);

  return daysMissed > 1 ? "overdue" : "expected";
}

/* -------------------------------------------------------------------------- */
/* Insights                                                                   */
/* -------------------------------------------------------------------------- */

export interface OverdueInsight {
  taskId: string;
  title: string;
  days: number;
}

/** The one that has been late longest, which is usually the one nobody owns. */
export function oldestOverdue(tasks: WorkTask[], now: Date): OverdueInsight | null {
  const overdue = tasks
    .filter((task) => isOverdue(task, now))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const worst = overdue[0];

  if (!worst) return null;

  return {
    taskId: worst.id,
    title: worst.title,
    days: Math.max(
      1,
      Math.round((startOfDay(now).getTime() - startOfDay(new Date(worst.dueDate)).getTime()) / 86_400_000),
    ),
  };
}

export interface TeamMember {
  id: string;
  name: string;
  role: string | null;
  open: number;
  overdue: number;
  blocked: number;
  dueSoon: number;
}

/**
 * Who is actually working on this account, counted from assignments.
 *
 * Ordered by how much they are carrying rather than alphabetically, so the
 * person to talk to first is the person listed first.
 */
export function teamOnAccount(tasks: WorkTask[], now: Date): TeamMember[] {
  const byId = new Map<string, TeamMember>();

  for (const task of tasks) {
    if (!task.assignee || !isOpen(task)) continue;

    const existing = byId.get(task.assignee.id) ?? {
      id: task.assignee.id,
      name: task.assignee.name,
      role: task.assignee.role,
      open: 0,
      overdue: 0,
      blocked: 0,
      dueSoon: 0,
    };

    existing.open += 1;
    if (isOverdue(task, now)) existing.overdue += 1;
    if (task.status === "BLOCKED") existing.blocked += 1;
    if (isDueSoon(task, now)) existing.dueSoon += 1;

    byId.set(task.assignee.id, existing);
  }

  return [...byId.values()].sort(
    (a, b) => b.overdue - a.overdue || b.blocked - a.blocked || b.open - a.open,
  );
}

export interface DeliveryRisk {
  /** What to do about it, in the words a project manager would use. */
  headline: string;
  detail: string;
  /** The metric card that shows the work behind it, so the claim is checkable. */
  filter: WorkMetricKey;
}

/**
 * The biggest thing in the way, or nothing.
 *
 * Ranked by what actually stops delivery soonest rather than by count: work
 * that cannot proceed at all beats work that is merely late, and both beat a
 * queue of things waiting to be looked at. Returns null when none of the
 * signals are present, because a risk panel that always finds a risk is one
 * nobody reads.
 */
export function biggestRisk(tasks: WorkTask[], now: Date): DeliveryRisk | null {
  const blocked = tasks.filter((task) => matchesMetric(task, "blocked", now));

  if (blocked.length > 0) {
    const byProject = new Map<string, number>();

    for (const task of blocked) {
      const name = task.projectName ?? "Unassigned work";

      byProject.set(name, (byProject.get(name) ?? 0) + 1);
    }

    const [worst, count] = [...byProject.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      headline: worst,
      detail: `${count} blocked task${count === 1 ? "" : "s"}`,
      filter: "blocked",
    };
  }

  const waiting = tasks.filter((task) => isOpen(task) && task.status === "WAITING_CLIENT");

  if (waiting.length > 0) {
    return {
      headline: "Waiting on the client",
      detail: `${waiting.length} task${waiting.length === 1 ? "" : "s"} affected`,
      filter: "active",
    };
  }

  const overdue = tasks.filter((task) => isOverdue(task, now));
  const critical = overdue.filter((task) => task.priority === "HIGH" || task.priority === "URGENT");

  if (critical.length > 0) {
    return {
      headline: "High priority work is late",
      detail: `${critical.length} overdue task${critical.length === 1 ? "" : "s"}`,
      filter: "overdue",
    };
  }

  if (overdue.length > 2) {
    return {
      headline: "Delivery is slipping",
      detail: `${overdue.length} tasks past their due date`,
      filter: "overdue",
    };
  }

  const review = tasks.filter((task) => matchesMetric(task, "needsReview", now));

  if (review.length > 2) {
    return {
      headline: "Review queue is backing up",
      detail: `${review.length} tasks waiting on a reviewer`,
      filter: "needsReview",
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Work health                                                                */
/* -------------------------------------------------------------------------- */

export type WorkHealth = "HEALTHY" | "AT_RISK" | "BLOCKED";

export const WORK_HEALTH_LABELS: Record<WorkHealth, string> = {
  HEALTHY: "Healthy",
  AT_RISK: "At Risk",
  BLOCKED: "Blocked",
};

/**
 * How delivery for this account is going.
 *
 * Deliberately about the work and nothing else. Account health is a wider
 * judgement that takes in the relationship, the invoices and the stage; this
 * one answers "is the work moving", and the two are allowed to differ - an
 * account can be commercially healthy with its delivery stuck.
 */
export function workHealth(tasks: WorkTask[], now: Date): WorkHealth {
  if (tasks.some((task) => matchesMetric(task, "blocked", now))) return "BLOCKED";

  const overdue = tasks.filter((task) => isOverdue(task, now));

  if (overdue.some((task) => task.priority === "HIGH" || task.priority === "URGENT")) {
    return "AT_RISK";
  }

  if (overdue.length > 2) return "AT_RISK";

  return "HEALTHY";
}
