import { ArrowRight, Sun } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ClientSnapshot,
  PriorityAlerts,
  RecentActivity,
  SummaryCards,
  WeeklyProgress,
  WorkloadPanel,
} from "@/components/dashboard/dashboard-panels";
import type { TaskRow } from "@/components/work/task-types";
import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { teamRoleLabels } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { deriveDashboard } from "@/lib/tasks/my-work-view";
import {
  getAssignedTasks,
  getMyRecentActivity,
  getRecentCommentsOnMyWork,
} from "@/lib/tasks/task-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Dashboard",
};

/**
 * The Dashboard.
 *
 * An awareness page, not a second place to do the work. It answers "what is
 * happening" - what needs me today, what is late, which accounts am I carrying,
 * how is the week going - and every action on it is a link into the page that
 * already owns that behaviour. My Work stays the place where work is done.
 *
 * Every figure comes from the same derivation My Work uses, over the same rows.
 * Two pages computing "overdue" separately is how they end up disagreeing, and
 * the reader has no way to tell which one is lying.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    redirect("/login");
  }

  const [work, activity, comments, profile] = await Promise.all([
    getAssignedTasks(actor),
    getMyRecentActivity(actor, 5),
    getRecentCommentsOnMyWork(actor),
    prisma.user.findUnique({
      where: { id: actor.id },
      select: { weeklyCapacityHours: true },
    }),
  ]);

  /*
   * Dates become strings on the way to the derivations, which is the shape the
   * browser side of My Work already works in. Narrowed field by field rather
   * than spread - the same discipline that stops a Prisma Decimal reaching a
   * client component, which has broken this app before.
   */
  const tasks: TaskRow[] = work.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    category: task.category,
    platform: task.platform,
    recurrence: task.recurrence,
    dueDate: task.dueDate.toISOString(),
    startDate: task.startDate?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    submittedAt: task.submittedAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    approvedAt: task.approvedAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    estimatedHours: task.estimatedHours,
    actualHours: task.actualHours,
    requiresApproval: task.requiresApproval,
    objective: task.objective,
    completionCriteria: task.completionCriteria,
    note: task.note,
    kpi: task.kpi,
    blocker: task.blocker,
    requiredAssets: task.requiredAssets,
    revisionNote: task.revisionNote,
    evidenceUrl: task.evidenceUrl,
    client: task.client,
    project: task.project,
    assignedTo: task.assignedTo,
    createdBy: task.createdBy,
    reviewer: task.reviewer,
    approvedBy: task.approvedBy,
    commentCount: task._count.comments,
  }));

  const now = new Date();

  const view = deriveDashboard(
    tasks,
    actor.id,
    now,
    profile?.weeklyCapacityHours ?? 40,
    comments.map((comment) => ({
      id: comment.id,
      taskId: comment.task.id,
      taskTitle: comment.task.title,
      authorName: comment.author.name,
      body: comment.body.length > 90 ? `${comment.body.slice(0, 87)}...` : comment.body,
      createdAt: comment.createdAt.toISOString(),
    })),
  );

  // The greeting uses whatever the person is actually called, not a literal.
  const firstName = actor.name.trim().split(/\s+/)[0];

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            Good day, {firstName}
            <Sun className="h-5 w-5 shrink-0 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Here&rsquo;s what needs your attention today.
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {teamRoleLabels[actor.teamRole]}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/*
            Both go to My Work rather than doing anything here. The dashboard
            says what is happening; the doing lives on one page, and a second
            copy of it would be the one that drifts.
          */}
          <Link
            href="/work?focus=today"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            My Tasks Today
          </Link>
          <Link
            href="/work"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800"
          >
            Open My Work
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <SummaryCards view={view} />

      {/*
        Three columns on a wide screen, two on a tablet, stacked on a phone.
        Alerts and clients get the room because they are the two panels somebody
        actually reads; the figures on the right are glanced at.
      */}
      {/*
        * The base track is minmax(0,1fr), not the implicit auto.
        *
        * An auto track cannot size below the min-content of what is in it,
        * and these cards contain truncated single-line text - `truncate`
        * sets white-space:nowrap, whose min-content width is the whole
        * string. On a 320px phone that pinned every card at 366px and took
        * the page sideways, so the left edge of the heading sat off screen.
        * The named breakpoints are already minmax(0,...); only the phone
        * case was missing one.
        */}
      <div className="grid items-start gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,0.85fr)]">
        <PriorityAlerts alerts={view.attention.slice(0, 5)} now={now} />
        <ClientSnapshot clients={view.clients} now={now} />

        <div className="space-y-4 lg:col-span-2 2xl:col-span-1">
          <WeeklyProgress view={view} />
          <WorkloadPanel workload={view.workload} />
        </div>
      </div>

      <RecentActivity
        now={now}
        events={activity.map((event) => ({
          id: event.id,
          action: event.action,
          createdAt: event.createdAt.toISOString(),
          actorName: event.actor?.name ?? null,
        }))}
      />
    </div>
  );
}
