import type { TaskRow } from "@/components/work/task-types";

import { ACTIVE_STATUSES, COMPLETED_STATUSES, endOfDay, startOfDay } from "./task-filters";

/**
 * The daily overview, worked out from the same rows the task list uses.
 *
 * Every number here is derived from one array. That is the point: a summary
 * card fed by its own query eventually disagrees with the list underneath it,
 * and the person reading it has no way to tell which one lied. Nothing in this
 * file goes to the database.
 *
 * Scoped to work the person is actually doing. A project manager can see the
 * whole agency's tasks in the list below, but "am I behind" is a question about
 * their own plate, not everybody's.
 */

export interface MyWorkSummary {
  dueToday: number;
  dueSoon: number;
  overdue: number;
  waitingOnClient: number;
  needsReview: number;
  completedThisWeek: number;
}

export interface FocusTask {
  task: TaskRow;
  /** Why it surfaced, so the row can say so rather than just ranking silently. */
  reason: "overdue" | "revision" | "due-today" | "in-progress" | "urgent" | "upcoming";
  action: "Open Task" | "Start Task" | "View Feedback" | "Continue Task";
}

export interface WaitingItem {
  task: TaskRow;
  reason: string;
  since: string;
}

/** A comment somebody else left, for the alert that says so. */
export interface RecentComment {
  id: string;
  taskId: string;
  taskTitle: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface AttentionItem {
  id: string;
  kind: "revision" | "review" | "overdue" | "due-today" | "blocked" | "waiting" | "comment";
  title: string;
  detail: string;
  when: string;
  action: string;
  taskId: string;
}

/*
 * Exactly the labels journey health uses, so the Dashboard's chip can carry the
 * account's real health rather than a second opinion derived from one person's
 * tasks. "Blocked" was missing, which flattened every blocked account to At Risk.
 */
export type ClientState = "On Track" | "At Risk" | "Waiting" | "Blocked";

export interface ClientCard {
  id: string | null;
  name: string;
  activeTasks: number;
  waitingOnClient: number;
  needsReview: number;
  nextDue: string | null;
  latestActivity: string | null;
  /**
   * The account's health.
   *
   * Derived here from the reader's own tasks as a fallback, then replaced by
   * the Journey board's health wherever the account is visible - the chip sits
   * beside an account name, so it has to mean what Journey means by it.
   */
  state: ClientState;
  overdue: number;
  blocked: number;
}

export interface WeekMetrics {
  completed: number;
  inProgress: number;
  needsReview: number;
  estimatedHours: number;
  actualHours: number;
  overdue: number;
}

export interface MyWorkView {
  summary: MyWorkSummary;
  focus: FocusTask[];
  waiting: WaitingItem[];
  attention: AttentionItem[];
  clients: ClientCard[];
  week: WeekMetrics;
}

/** Monday, because every other week boundary in this codebase is Monday. */
export function startOfWeek(now: Date) {
  const today = startOfDay(now);
  const weekday = (today.getDay() + 6) % 7;
  const monday = new Date(today);

  monday.setDate(monday.getDate() - weekday);
  return monday;
}

function isFinished(task: TaskRow) {
  return COMPLETED_STATUSES.includes(task.status) || task.status === "CANCELLED";
}

/** Live work: not archived, not over. */
function isLive(task: TaskRow) {
  return !task.archivedAt && !isFinished(task);
}

function daysUntil(dueDate: string, now: Date) {
  return Math.round(
    (startOfDay(new Date(dueDate)).getTime() - startOfDay(now).getTime()) / 86_400_000,
  );
}

/** The tasks this person is doing, as opposed to everything they can see. */
export function tasksAssignedTo(tasks: TaskRow[], userId: string) {
  return tasks.filter((task) => task.assignedTo?.id === userId);
}

export function summariseMyWork(mine: TaskRow[], now: Date): MyWorkSummary {
  const weekStart = startOfWeek(now);
  const soonLimit = endOfDay(new Date(startOfDay(now).getTime() + 3 * 86_400_000));

  let dueToday = 0;
  let dueSoon = 0;
  let overdue = 0;
  let waitingOnClient = 0;
  let needsReview = 0;
  let completedThisWeek = 0;

  for (const task of mine) {
    if (task.completedAt && COMPLETED_STATUSES.includes(task.status)) {
      const completed = new Date(task.completedAt);
      if (completed >= weekStart && completed <= now) completedThisWeek += 1;
    }

    if (!isLive(task)) continue;

    if (task.status === "WAITING_CLIENT") waitingOnClient += 1;
    if (task.status === "NEEDS_REVIEW") needsReview += 1;

    const days = daysUntil(task.dueDate, now);

    // The three date buckets are exclusive, so reading them together gives the
    // real total rather than double-counting today.
    if (days < 0) overdue += 1;
    else if (days === 0) dueToday += 1;
    else if (new Date(task.dueDate) <= soonLimit) dueSoon += 1;
  }

  return { dueToday, dueSoon, overdue, waitingOnClient, needsReview, completedThisWeek };
}

/**
 * The five things to do first.
 *
 * Ranked in the order somebody would pick them up if they thought about it for
 * a minute: what is already late, what has been sent back, what is due today,
 * what is half-finished, then what is both urgent and close.
 *
 * Work parked on a client or a blocker is deliberately absent - it has its own
 * section, because "focus on this" is wrong advice for something you cannot
 * move.
 */
export function todaysFocus(mine: TaskRow[], now: Date, limit = 5): FocusTask[] {
  const candidates = mine.filter(
    (task) => isLive(task) && task.status !== "WAITING_CLIENT" && task.status !== "BLOCKED",
  );

  const scored = candidates.map((task) => {
    const days = daysUntil(task.dueDate, now);
    const urgent = task.priority === "URGENT" || task.priority === "CRITICAL"
      || task.priority === "HIGH";

    let rank: number;
    let reason: FocusTask["reason"];

    if (days < 0) {
      rank = 0;
      reason = "overdue";
    } else if (task.status === "REVISION_REQUIRED") {
      rank = 1;
      reason = "revision";
    } else if (days === 0) {
      rank = 2;
      reason = "due-today";
    } else if (task.status === "IN_PROGRESS") {
      rank = 3;
      reason = "in-progress";
    } else if (urgent && days <= 3) {
      rank = 4;
      reason = "urgent";
    } else {
      rank = 5;
      reason = "upcoming";
    }

    return { task, rank, reason, days };
  });

  scored.sort((a, b) => a.rank - b.rank || a.days - b.days);

  return scored.slice(0, limit).map(({ task, reason }) => ({
    task,
    reason,
    action:
      reason === "revision"
        ? "View Feedback"
        : task.status === "IN_PROGRESS"
          ? "Open Task"
          : task.status === "TODO" || task.status === "BACKLOG"
            ? "Start Task"
            : "Continue Task",
  }));
}

/**
 * Work that cannot move.
 *
 * The reason comes from the blocker field where somebody wrote one. "Waiting
 * since" is the last write to the task, which for parked work is the write that
 * parked it - close enough to be useful and honest about being approximate.
 */
export function waitingAndBlocked(mine: TaskRow[]): WaitingItem[] {
  return mine
    .filter(
      (task) =>
        !task.archivedAt
        && (task.status === "WAITING_CLIENT" || task.status === "BLOCKED"),
    )
    .map((task) => ({
      task,
      reason:
        task.blocker?.trim()
        || (task.status === "WAITING_CLIENT"
          ? "Waiting on the client"
          : "Blocked, with no reason recorded"),
      since: task.updatedAt,
    }))
    .sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());
}

/**
 * Things that need a decision, rather than things that need doing.
 *
 * Only signals that can actually be derived from stored state appear here.
 * "Client uploaded an asset" and "a blocker was resolved" are in the reference
 * design but nothing in this schema records them, and a panel that invents
 * events is worse than one that shows fewer.
 */
export function needsMyAttention(
  visible: TaskRow[],
  userId: string,
  now: Date,
  limit = 6,
  comments: RecentComment[] = [],
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const mine = tasksAssignedTo(visible, userId);

  for (const task of mine) {
    if (!isLive(task)) continue;

    if (task.status === "REVISION_REQUIRED") {
      items.push({
        id: `revision-${task.id}`,
        kind: "revision",
        title: "Revision requested",
        detail: task.revisionNote?.trim() || task.title,
        when: task.updatedAt,
        action: "View Feedback",
        taskId: task.id,
      });
      continue;
    }

    if (task.status === "WAITING_CLIENT") {
      items.push({
        id: `waiting-${task.id}`,
        kind: "waiting",
        title: "Waiting for client",
        detail: task.blocker?.trim()
          ? `${task.title} — ${task.blocker.trim()}`
          : task.title,
        when: task.updatedAt,
        action: "View Task",
        taskId: task.id,
      });
      continue;
    }

    if (task.status === "BLOCKED" && task.blocker?.trim()) {
      items.push({
        id: `blocked-${task.id}`,
        kind: "blocked",
        title: "Blocked",
        detail: `${task.title} — ${task.blocker.trim()}`,
        when: task.updatedAt,
        action: "Open Task",
        taskId: task.id,
      });
      continue;
    }

    const days = daysUntil(task.dueDate, now);

    if (days < 0) {
      items.push({
        id: `overdue-${task.id}`,
        kind: "overdue",
        title: "Overdue task",
        detail: task.title,
        when: task.dueDate,
        action: "Open Task",
        taskId: task.id,
      });
    } else if (days === 0) {
      items.push({
        id: `due-${task.id}`,
        kind: "due-today",
        title: "Task due today",
        detail: task.title,
        when: task.dueDate,
        action: "Open Task",
        taskId: task.id,
      });
    }
  }

  // Work waiting on this person's decision. Somebody else did it, so it is not
  // in the list above, but it is still stopping them.
  for (const task of visible) {
    if (task.archivedAt) continue;
    if (task.status !== "NEEDS_REVIEW") continue;
    if (task.reviewer?.id !== userId) continue;
    if (task.assignedTo?.id === userId) continue;

    items.push({
      id: `review-${task.id}`,
      kind: "review",
      title: "Waiting for your review",
      detail: `${task.title} — from ${task.assignedTo?.name ?? "the team"}`,
      when: task.submittedAt ?? task.updatedAt,
      action: "Review",
      taskId: task.id,
    });
  }

  // Somebody wrote to you about your work. Only counted when it was somebody
  // else - your own comment is not news.
  for (const comment of comments) {
    items.push({
      id: `comment-${comment.id}`,
      kind: "comment",
      title: `${comment.authorName} commented`,
      detail: `${comment.taskTitle} — ${comment.body}`,
      when: comment.createdAt,
      action: "Open Task",
      taskId: comment.taskId,
    });
  }

  const weight: Record<AttentionItem["kind"], number> = {
    revision: 0,
    review: 1,
    overdue: 2,
    blocked: 3,
    comment: 4,
    "due-today": 5,
    waiting: 6,
  };

  items.sort(
    (a, b) =>
      weight[a.kind] - weight[b.kind]
      || new Date(b.when).getTime() - new Date(a.when).getTime(),
  );

  return items.slice(0, limit);
}

/**
 * The accounts this person is carrying, with the shape of each one.
 *
 * Built from their tasks rather than from client ownership, because somebody
 * doing one piece of work for an account is supporting it whether or not their
 * name is on the record. Internal work is gathered under one heading so it does
 * not disappear.
 */
export function myClients(mine: TaskRow[], now: Date): ClientCard[] {
  const groups = new Map<string, ClientCard>();

  for (const task of mine) {
    if (task.archivedAt) continue;

    const key = task.client?.id ?? "internal";

    let card = groups.get(key);

    if (!card) {
      card = {
        id: task.client?.id ?? null,
        name: task.client?.companyName ?? "Internal / Agency Work",
        activeTasks: 0,
        waitingOnClient: 0,
        needsReview: 0,
        nextDue: null,
        latestActivity: null,
        state: "On Track",
        overdue: 0,
        blocked: 0,
      };
      groups.set(key, card);
    }

    if (ACTIVE_STATUSES.includes(task.status)) card.activeTasks += 1;
    if (task.status === "WAITING_CLIENT") card.waitingOnClient += 1;
    if (task.status === "NEEDS_REVIEW") card.needsReview += 1;
    if (task.status === "BLOCKED") card.blocked += 1;
    if (isLive(task) && new Date(task.dueDate) < startOfDay(now)) card.overdue += 1;

    // The next thing falling due that is not already late - what somebody
    // actually wants to see beside a client name.
    if (isLive(task) && new Date(task.dueDate) >= startOfDay(now)) {
      if (!card.nextDue || new Date(task.dueDate) < new Date(card.nextDue)) {
        card.nextDue = task.dueDate;
      }
    }

    if (!card.latestActivity || new Date(task.updatedAt) > new Date(card.latestActivity)) {
      card.latestActivity = task.updatedAt;
    }
  }

  /*
   * The state is worked out from the account's own work rather than read from
   * the stored health field. Health is a judgement somebody makes about the
   * relationship; this answers the narrower question of whether the work is
   * moving, which is what a person glancing at their own board wants.
   */
  for (const card of groups.values()) {
    if (card.overdue > 0 || card.blocked > 0) card.state = "At Risk";
    else if (card.waitingOnClient > 0) card.state = "Waiting";
    else card.state = "On Track";
  }

  return [...groups.values()].sort(
    (a, b) => b.activeTasks - a.activeTasks || a.name.localeCompare(b.name),
  );
}

/**
 * How much of what finished this week landed on time.
 *
 * Null rather than 100% when nothing has finished yet - a rate with no
 * denominator is not a good score, it is an absent one, and showing it as
 * perfect flatters a week that has not started.
 */
export function onTimeRate(mine: TaskRow[], now: Date): number | null {
  const weekStart = startOfWeek(now);
  let finished = 0;
  let onTime = 0;

  for (const task of mine) {
    if (!task.completedAt || !COMPLETED_STATUSES.includes(task.status)) continue;

    const completed = new Date(task.completedAt);

    if (completed < weekStart || completed > now) continue;

    finished += 1;
    // Compared by day rather than by timestamp: finishing at 6pm on the due
    // date is on time, and anybody would say so.
    if (startOfDay(completed) <= startOfDay(new Date(task.dueDate))) onTime += 1;
  }

  return finished === 0 ? null : Math.round((onTime / finished) * 100);
}

export interface Workload {
  bookedHours: number;
  capacityHours: number;
  availableHours: number;
  percentUsed: number;
  state: "Healthy" | "Near Capacity" | "Over Capacity";
}

/**
 * What is booked against this week, and how much room is left.
 *
 * Booked means estimated hours on work that is live or was finished this week -
 * the hours this week actually asks of somebody. Capacity comes from the
 * person's own record rather than a constant, because a part-time seat with a
 * forty-hour bar would always look healthy.
 */
export function workloadThisWeek(
  mine: TaskRow[],
  now: Date,
  capacityHours: number,
): Workload {
  const weekStart = startOfWeek(now);
  let bookedHours = 0;

  for (const task of mine) {
    if (task.archivedAt) continue;

    if (COMPLETED_STATUSES.includes(task.status) || task.status === "CANCELLED") {
      const completed = task.completedAt ? new Date(task.completedAt) : null;
      if (completed && completed >= weekStart && completed <= now) {
        bookedHours += task.actualHours ?? task.estimatedHours;
      }
      continue;
    }

    bookedHours += task.estimatedHours;
  }

  // A capacity of zero would divide by nothing. Treat it as unset and fall back
  // to the column default rather than rendering NaN%.
  const capacity = capacityHours > 0 ? capacityHours : 40;
  const percentUsed = Math.round((bookedHours / capacity) * 100);

  return {
    bookedHours,
    capacityHours: capacity,
    availableHours: Math.max(0, capacity - bookedHours),
    percentUsed,
    state:
      percentUsed > 90 ? "Over Capacity" : percentUsed >= 70 ? "Near Capacity" : "Healthy",
  };
}

/** This week's numbers, for this person only. */
export function weekMetrics(mine: TaskRow[], now: Date): WeekMetrics {
  const weekStart = startOfWeek(now);
  const today = startOfDay(now);

  let completed = 0;
  let inProgress = 0;
  let needsReview = 0;
  let estimatedHours = 0;
  let actualHours = 0;
  let overdue = 0;

  for (const task of mine) {
    if (task.completedAt && COMPLETED_STATUSES.includes(task.status)) {
      const done = new Date(task.completedAt);

      if (done >= weekStart && done <= now) {
        completed += 1;
        // Hours are counted on the work finished this week, so estimate and
        // actual describe the same set and can honestly be compared.
        estimatedHours += task.estimatedHours;
        actualHours += task.actualHours ?? 0;
      }
    }

    if (!isLive(task)) continue;

    if (task.status === "IN_PROGRESS") {
      inProgress += 1;
      estimatedHours += task.estimatedHours;
      actualHours += task.actualHours ?? 0;
    }

    if (task.status === "NEEDS_REVIEW") needsReview += 1;
    if (new Date(task.dueDate) < today) overdue += 1;
  }

  return { completed, inProgress, needsReview, estimatedHours, actualHours, overdue };
}

/** Everything the overview needs, from one pass over the rows. */
export function deriveMyWork(
  visible: TaskRow[],
  userId: string,
  now: Date,
  comments: RecentComment[] = [],
): MyWorkView {
  const mine = tasksAssignedTo(visible, userId);

  return {
    summary: summariseMyWork(mine, now),
    focus: todaysFocus(mine, now),
    waiting: waitingAndBlocked(mine),
    attention: needsMyAttention(visible, userId, now, 6, comments),
    clients: myClients(mine, now),
    week: weekMetrics(mine, now),
  };
}

export interface DashboardView extends MyWorkView {
  inProgress: number;
  onTimeRate: number | null;
  workload: Workload;
}

/**
 * The dashboard, built from the same pass as My Work plus three figures only it
 * shows. Deliberately not a second set of counts: the two pages disagreeing
 * about how many tasks are overdue is exactly the failure worth preventing.
 */
export function deriveDashboard(
  visible: TaskRow[],
  userId: string,
  now: Date,
  capacityHours: number,
  comments: RecentComment[] = [],
): DashboardView {
  const mine = tasksAssignedTo(visible, userId);
  const base = deriveMyWork(visible, userId, now, comments);

  return {
    ...base,
    inProgress: base.week.inProgress,
    onTimeRate: onTimeRate(mine, now),
    workload: workloadThisWeek(mine, now, capacityHours),
  };
}
