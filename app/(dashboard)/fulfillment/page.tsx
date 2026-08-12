import { notFound } from "next/navigation";

import { WeeklyWorkBoard } from "@/components/fulfillment/weekly-work-board";
import { loadAuthContext } from "@/lib/authz";
import { getRecentEodActivity, getWeeklyWorkData } from "@/lib/eod/weekly-queries";
import { reportingDeadline } from "@/lib/eod/weekly-report-service";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Weekly Work",
};

/**
 * Weekly Work.
 *
 * The reporting page: who has filed today's entries, what is blocked, and where
 * each person's week stands. Everything a manager can do here is read or
 * review - writing an entry belongs to the person who did the work, on their
 * own task in My Work.
 */
export default async function WeeklyWorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    notFound();
  }

  const week = typeof params.week === "string" ? params.week : null;

  const [data, recent] = await Promise.all([
    getWeeklyWorkData(actor, week),
    getRecentEodActivity(actor),
  ]);

  const deadline = await reportingDeadline(data.weekStart);

  /*
   * Serialised field by field on the way to the browser. Dates become strings
   * because that is what survives, and narrowing rather than spreading is what
   * stops a Prisma Decimal reaching a client component - a bug this app has
   * already had once.
   */
  const tasks = data.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    startDate: task.startDate?.toISOString() ?? null,
    dueDate: task.dueDate.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    blocker: task.blocker,
    estimatedHours: task.estimatedHours,
    assignedTo: task.assignedTo,
    client: task.client,
  }));

  const entries = data.entries.map((entry) => ({
    id: entry.id,
    taskId: entry.taskId,
    authorId: entry.authorId,
    authorName: entry.author.name,
    entryDate: entry.entryDate.toISOString(),
    summary: entry.summary,
    nextSteps: entry.nextSteps,
    blockers: entry.blockers,
    progressPercent: entry.progressPercent,
    hoursSpent: entry.hoursSpent,
    workLink: entry.workLink,
    taskStatus: entry.taskStatus,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));

  const reports = data.reports.map((report) => ({
    id: report.id,
    userId: report.userId,
    status: report.status,
    summary: report.summary,
    submittedAt: report.submittedAt?.toISOString() ?? null,
    approvedAt: report.approvedAt?.toISOString() ?? null,
    managerNote: report.managerNote,
    approvedByName: report.approvedBy?.name ?? null,
    userName: report.user.name,
    userRole: report.user.teamRole,
  }));

  return (
    <WeeklyWorkBoard
      weekStart={data.weekStart.toISOString()}
      tasks={tasks}
      entries={entries}
      members={data.members}
      reports={reports}
      recentActivity={recent.map((item) => ({
        id: item.id,
        authorName: item.author.name,
        taskId: item.task.id,
        taskTitle: item.task.title,
        updatedAt: item.updatedAt.toISOString(),
        revised: item.createdAt.getTime() !== item.updatedAt.getTime(),
      }))}
      viewerId={actor.id}
      canReview={can(actor, "workItems.review") || can(actor, "team.manage")}
      deadline={deadline.toISOString()}
      today={new Date().toISOString()}
    />
  );
}
