import type { EmployeeTaskStatus } from "@prisma/client";

import { requiresEodOn, type EodCandidateTask } from "./eod-rules";

/**
 * Turning a week's tasks and entries into the numbers a manager reads.
 *
 * Pure functions over rows, like the task derivations: the page, the summary
 * cards and the per-person cards all run the same code, so a card cannot
 * disagree with the list under it. Nothing here touches the database.
 *
 * The distinction that matters most in this file: task compliance and person
 * compliance are different questions. Fourteen of seventeen entries filed is
 * not the same as five of six people done, and a manager chasing the wrong one
 * chases the wrong person.
 */

export interface WeekTask {
  id: string;
  title: string;
  status: EmployeeTaskStatus;
  startDate: string | null;
  dueDate: string;
  completedAt: string | null;
  archivedAt: string | null;
  blocker: string | null;
  estimatedHours: number;
  assignedTo: { id: string; name: string; teamRole: string | null } | null;
  client: { id: string; companyName: string } | null;
}

export interface WeekEod {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  entryDate: string;
  summary: string;
  nextSteps: string | null;
  blockers: string | null;
  progressPercent: number | null;
  hoursSpent: number | null;
  workLink: string | null;
  taskStatus: EmployeeTaskStatus | null;
  createdAt: string;
  updatedAt: string;
}

export function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function startOfWeek(date: Date) {
  const day = startOfDay(date);
  const weekday = (day.getDay() + 6) % 7;

  day.setDate(day.getDate() - weekday);
  return day;
}

export function endOfWeek(weekStart: Date) {
  const end = new Date(weekStart);

  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function sameDay(a: Date | string, b: Date | string) {
  return startOfDay(new Date(a)).getTime() === startOfDay(new Date(b)).getTime();
}

function toCandidate(task: WeekTask): EodCandidateTask {
  return {
    id: task.id,
    status: task.status,
    startDate: task.startDate ? new Date(task.startDate) : null,
    dueDate: new Date(task.dueDate),
    archivedAt: task.archivedAt ? new Date(task.archivedAt) : null,
  };
}

/** The tasks that needed an entry on this day. */
export function tasksRequiringEod(tasks: WeekTask[], day: Date): WeekTask[] {
  return tasks.filter((task) => requiresEodOn(toCandidate(task), day));
}

export interface MemberEodSummary {
  userId: string;
  name: string;
  teamRole: string | null;
  activeTasks: number;
  requiredToday: number;
  submittedToday: number;
  missingToday: number;
  blockedTasks: number;
  state: "EOD Complete" | "Needs Attention" | "Missing EOD" | "Has Blocker" | "Nothing Due";
}

/**
 * One card per person: what they have on, and whether today is accounted for.
 *
 * Somebody with nothing due gets "Nothing Due" rather than a green tick.
 * Marking an empty day complete flatters it, and a manager scanning for who to
 * chase would skip right past somebody who has simply stopped being assigned
 * anything.
 */
export function summariseMembers(
  tasks: WeekTask[],
  entries: WeekEod[],
  members: { id: string; name: string; teamRole: string | null }[],
  day: Date,
): MemberEodSummary[] {
  const required = tasksRequiringEod(tasks, day);

  const submittedKeys = new Set(
    entries
      .filter((entry) => sameDay(entry.entryDate, day))
      .map((entry) => `${entry.taskId}:${entry.authorId}`),
  );

  return members.map((member) => {
    const mine = tasks.filter((task) => task.assignedTo?.id === member.id);
    const myRequired = required.filter((task) => task.assignedTo?.id === member.id);

    const submittedToday = myRequired.filter((task) =>
      submittedKeys.has(`${task.id}:${member.id}`),
    ).length;

    const missingToday = myRequired.length - submittedToday;
    const blockedTasks = mine.filter((task) => task.status === "BLOCKED" && !task.archivedAt).length;

    const activeTasks = mine.filter(
      (task) =>
        !task.archivedAt
        && !["APPROVED", "DONE", "CANCELLED"].includes(task.status),
    ).length;

    let state: MemberEodSummary["state"];

    if (myRequired.length === 0) state = "Nothing Due";
    else if (missingToday > 0 && blockedTasks > 0) state = "Needs Attention";
    else if (missingToday > 0) state = "Missing EOD";
    else if (blockedTasks > 0) state = "Has Blocker";
    else state = "EOD Complete";

    return {
      userId: member.id,
      name: member.name,
      teamRole: member.teamRole,
      activeTasks,
      requiredToday: myRequired.length,
      submittedToday,
      missingToday,
      blockedTasks,
      state,
    };
  });
}

export interface ComplianceSummary {
  /** Entries filed against entries owed, today. */
  tasksRequired: number;
  tasksSubmitted: number;
  taskPercent: number;
  /** People who owe nothing more today, against people who owed anything. */
  membersExpected: number;
  membersComplete: number;
}

/**
 * The two compliance figures, kept apart on purpose.
 *
 * Fourteen of seventeen entries and five of six people are different facts
 * about the same day, and a page that shows one of them labelled as the other
 * sends somebody to chase the wrong person.
 */
export function complianceFor(
  members: MemberEodSummary[],
): ComplianceSummary {
  const owing = members.filter((member) => member.requiredToday > 0);

  const tasksRequired = owing.reduce((total, member) => total + member.requiredToday, 0);
  const tasksSubmitted = owing.reduce((total, member) => total + member.submittedToday, 0);

  return {
    tasksRequired,
    tasksSubmitted,
    taskPercent: tasksRequired === 0 ? 100 : Math.round((tasksSubmitted / tasksRequired) * 100),
    membersExpected: owing.length,
    membersComplete: owing.filter((member) => member.missingToday === 0).length,
  };
}

export interface WeekSummary {
  totalTasks: number;
  completed: number;
  submittedToday: number;
  requiredToday: number;
  missingToday: number;
  blocked: number;
}

export function summariseWeek(
  tasks: WeekTask[],
  members: MemberEodSummary[],
  weekStart: Date,
): WeekSummary {
  const weekEnd = endOfWeek(weekStart);

  const live = tasks.filter((task) => !task.archivedAt);

  const completed = live.filter((task) => {
    if (!task.completedAt) return false;
    const done = new Date(task.completedAt);
    return done >= weekStart && done <= weekEnd;
  }).length;

  const compliance = complianceFor(members);

  return {
    totalTasks: live.length,
    completed,
    submittedToday: compliance.tasksSubmitted,
    requiredToday: compliance.tasksRequired,
    missingToday: compliance.tasksRequired - compliance.tasksSubmitted,
    blocked: live.filter((task) => task.status === "BLOCKED").length,
  };
}

export interface AttentionRow {
  id: string;
  kind: "missing" | "blocked" | "silent";
  title: string;
  personName: string;
  detail: string;
  taskId: string;
}

/**
 * What a manager needs to act on, and nothing else.
 *
 * Successful submissions are deliberately absent: a list that shows everything
 * shows nothing, and the point of this panel is that its emptiness is good
 * news.
 */
export function needsAttention(
  tasks: WeekTask[],
  entries: WeekEod[],
  day: Date,
  limit = 8,
): AttentionRow[] {
  const rows: AttentionRow[] = [];
  const required = tasksRequiringEod(tasks, day);

  const submittedToday = new Set(
    entries
      .filter((entry) => sameDay(entry.entryDate, day))
      .map((entry) => `${entry.taskId}:${entry.authorId}`),
  );

  const everSubmitted = new Set(entries.map((entry) => entry.taskId));

  for (const task of required) {
    const person = task.assignedTo;

    if (!person) continue;

    if (task.status === "BLOCKED") {
      rows.push({
        id: `blocked-${task.id}`,
        kind: "blocked",
        title: task.title,
        personName: person.name,
        detail: task.blocker?.trim() || "Blocked, with no reason recorded",
        taskId: task.id,
      });
      continue;
    }

    if (!submittedToday.has(`${task.id}:${person.id}`)) {
      // Nothing all week is a different problem from nothing today, and worth
      // saying differently - one is a slip, the other is work nobody is
      // touching.
      const silent = !everSubmitted.has(task.id);

      rows.push({
        id: `missing-${task.id}`,
        kind: silent ? "silent" : "missing",
        title: task.title,
        personName: person.name,
        detail: silent ? "No update this week" : "Missing EOD today",
        taskId: task.id,
      });
    }
  }

  const weight: Record<AttentionRow["kind"], number> = { blocked: 0, silent: 1, missing: 2 };

  rows.sort((a, b) => weight[a.kind] - weight[b.kind]);

  return rows.slice(0, limit);
}

/** The progress trail for one task, for the mini timeline. */
export function progressTrail(entries: WeekEod[], taskId: string) {
  return entries
    .filter((entry) => entry.taskId === taskId && entry.progressPercent !== null)
    .sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime())
    .map((entry) => ({
      date: entry.entryDate,
      percent: entry.progressPercent as number,
    }));
}

/** The latest entry on a task, which is the one that describes where it stands. */
export function latestEntry(entries: WeekEod[], taskId: string, authorId?: string) {
  return (
    entries
      .filter(
        (entry) => entry.taskId === taskId && (!authorId || entry.authorId === authorId),
      )
      .sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime())[0]
    ?? null
  );
}
