import type { WeeklyReportStatus } from "@prisma/client";

import { endOfWeek, type WeekEod, type WeekTask } from "./weekly-view";

/**
 * Turning a week of entries into the shape a report reads in.
 *
 * Pure, and deliberately in its own file: the manager's board renders this in
 * the browser, and anything it imports comes with it. When these functions
 * lived beside the database service, importing them dragged the Postgres driver
 * into the client bundle and the build refused - correctly.
 *
 * Nothing here is stored. The compilation runs at read time from that week's
 * entries, so correcting a typo in Tuesday's entry corrects the report too. A
 * snapshot copied in at submission would drift from its own source and leave
 * two accounts of one week with no way to tell which was true.
 */

export interface CompiledSection {
  taskId: string;
  title: string;
  clientName: string;
  progressPercent: number | null;
  hoursSpent: number;
  latestUpdate: string;
  nextStep: string | null;
  blocker: string | null;
}

export interface CompiledReport {
  tasksWorkedOn: number;
  completed: CompiledSection[];
  inProgress: CompiledSection[];
  blocked: CompiledSection[];
  totalHours: number;
  eodCompliance: number | null;
  nextSteps: string[];
}

/**
 * Building the week out of its entries.
 *
 * Grouped by task rather than by day, because "what happened to the landing
 * page" is the question somebody reading a weekly report is asking. The day by
 * day version is the EOD history, and it is still there.
 */
export function compileWeek(
  tasks: WeekTask[],
  entries: WeekEod[],
  weekStart: Date,
  requiredEntryCount: number,
): CompiledReport {
  const weekEnd = endOfWeek(weekStart);
  const byTask = new Map<string, WeekEod[]>();

  for (const entry of entries) {
    const list = byTask.get(entry.taskId) ?? [];
    list.push(entry);
    byTask.set(entry.taskId, list);
  }

  const completed: CompiledSection[] = [];
  const inProgress: CompiledSection[] = [];
  const blocked: CompiledSection[] = [];
  const nextSteps: string[] = [];

  let totalHours = 0;
  /*
   * Counted as tasks resolve rather than from the size of the entry map. An
   * entry can point at a task outside the set being compiled - somebody else's,
   * or one filtered out - and counting those would put a number in the header
   * that the sections underneath cannot account for.
   */
  let tasksWorkedOn = 0;

  for (const [taskId, taskEntries] of byTask) {
    const task = tasks.find((candidate) => candidate.id === taskId);

    if (!task) continue;

    tasksWorkedOn += 1;

    const ordered = [...taskEntries].sort(
      (a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime(),
    );
    const latest = ordered[ordered.length - 1];

    const hours = ordered.reduce((sum, entry) => sum + (entry.hoursSpent ?? 0), 0);
    totalHours += hours;

    const section: CompiledSection = {
      taskId,
      title: task.title,
      clientName: task.client?.companyName ?? "Internal / Agency Work",
      progressPercent: latest.progressPercent,
      hoursSpent: hours,
      latestUpdate: latest.summary,
      nextStep: latest.nextSteps,
      blocker: latest.blockers,
    };

    const finishedThisWeek =
      task.completedAt
      && new Date(task.completedAt) >= weekStart
      && new Date(task.completedAt) <= weekEnd;

    if (finishedThisWeek) completed.push(section);
    else if (task.status === "BLOCKED" || latest.blockers) blocked.push(section);
    else inProgress.push(section);

    // Only work that is still going has a next step worth carrying forward.
    if (!finishedThisWeek && latest.nextSteps?.trim()) {
      nextSteps.push(`${task.title}: ${latest.nextSteps.trim()}`);
    }
  }

  return {
    tasksWorkedOn,
    completed,
    inProgress,
    blocked,
    totalHours: Math.round(totalHours * 10) / 10,
    eodCompliance:
      requiredEntryCount === 0
        ? null
        : Math.min(100, Math.round((entries.length / requiredEntryCount) * 100)),
    nextSteps,
  };
}

export interface ReportProgress {
  submitted: number;
  draft: number;
  notStarted: number;
  needsChanges: number;
  approved: number;
  expected: number;
}

/** The manager's tally of who has filed. */
export function reportProgress(
  reports: { status: WeeklyReportStatus }[],
  expected: number,
): ReportProgress {
  const count = (status: WeeklyReportStatus) =>
    reports.filter((report) => report.status === status).length;

  return {
    submitted: count("SUBMITTED"),
    draft: count("DRAFT"),
    needsChanges: count("NEEDS_CHANGES"),
    approved: count("APPROVED"),
    // Anybody without a row has not started. The row is only created when
    // somebody opens the week, so absence is the honest default.
    notStarted:
      expected - count("SUBMITTED") - count("DRAFT") - count("NEEDS_CHANGES") - count("APPROVED"),
    expected,
  };
}
