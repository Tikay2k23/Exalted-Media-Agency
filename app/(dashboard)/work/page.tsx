import Link from "next/link";
import { notFound } from "next/navigation";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AgencyTaskPanel } from "@/components/team/agency-task-panel";
import { PerformanceTable } from "@/components/team/performance-table";
import type { TaskRow } from "@/components/work/task-types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAuthContext } from "@/lib/authz";
import { getTeamViewData } from "@/lib/data/queries";
import { can, canManageEmployeeTasks, teamRoleLabels } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { deriveMyWork } from "@/lib/tasks/my-work-view";
import { getAssignedTasks, getMyRecentActivity } from "@/lib/tasks/task-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * My Work.
 *
 * The daily overview on top, the full task table under it, and the team's
 * workload at the bottom for whoever is responsible for it. This absorbed the
 * old Team page rather than sitting beside it: two menu items both meaning
 * "the work" is exactly the confusion the navigation was cut down to fix.
 */
export default async function WorkPage({
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

  const [data, work, recentActivity] = await Promise.all([
    getTeamViewData(user),
    getAssignedTasks(actor),
    getMyRecentActivity(actor),
  ]);

  const canManageTasks = canManageEmployeeTasks(user.role);
  const canSeeTeam = can(actor, "team.view");

  /*
   * Dates become strings on the way to the browser, and the client component
   * expects them that way. Narrowed field by field rather than spread, which is
   * also what stops a Prisma Decimal reaching a client component - that has
   * broken this app before.
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

  /*
   * The overview is derived from the rows the table below is given, filtered to
   * the work this person is actually doing. A delivery lead can see the whole
   * agency's tasks in the table; "am I behind" is still a question about their
   * own plate.
   */
  const overview = deriveMyWork(tasks, actor.id, now);

  return (
    <div className="space-y-6">
      <AgencyTaskPanel
        tasks={tasks}
        users={data.taskOptions.users}
        clients={data.taskOptions.clients}
        taskClients={work.clients}
        projects={data.taskOptions.projects}
        sops={data.taskOptions.sops}
        canManageTasks={canManageTasks}
        viewer={{
          id: actor.id,
          canEdit: can(actor, "workItems.edit"),
          canReviewAny: can(actor, "workItems.review"),
          canArchive: can(actor, "workItems.archive"),
          canDelete: can(actor, "workItems.delete"),
          canAssign: can(actor, "workItems.assign"),
        }}
        capped={work.capped}
        serverNow={now.toISOString()}
        identity={{
          eyebrow: "My work",
          title: teamRoleLabels[actor.teamRole],
          subtitle: "Everything you need to focus on and get things done.",
        }}
        overview={overview}
        /*
         * Links from the dashboard land on a task or in focus mode. The task id
         * is checked against the rows this person was allowed to fetch, so a
         * guessed id in the URL opens nothing rather than confirming a task
         * exists on an account they are not on.
         */
        initialTaskId={
          typeof params.task === "string"
          && tasks.some((task) => task.id === params.task)
            ? params.task
            : null
        }
        initialTodayOnly={params.focus === "today"}
        recentActivity={recentActivity.map((event) => ({
          id: event.id,
          action: event.action,
          fieldName: event.fieldName,
          previousValue: event.previousValue,
          newValue: event.newValue,
          createdAt: event.createdAt.toISOString(),
          actor: event.actor,
        }))}
      />

      {data.isDegraded ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle>Some team data is temporarily unavailable</CardTitle>
            <CardDescription>
              The workspace stayed online, but one or more team data queries failed. Refresh
              this page shortly to try again.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {/*
        Everything below is about the team rather than the person, so it only
        appears for the seats responsible for the team. A specialist's page ends
        at their own tasks.
      */}
      {canSeeTeam ? (
        <>
          <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Weekly updates</CardTitle>
                <CardDescription>
                  What each person did this week, and what stopped them.
                </CardDescription>
              </div>
              <Link
                href="/fulfillment"
                className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Open weekly work
              </Link>
            </CardHeader>
          </Card>

          <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle>Team Workload</CardTitle>
                <CardDescription>
                  Capacity, client ownership, and active delivery workload across the team.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PerformanceTable rows={data.teamPerformance} />
              </CardContent>
            </Card>

            <ActivityFeed activities={data.recentActivity} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Team Assignment Snapshot</CardTitle>
              <CardDescription>
                Department ownership, capacity, and client book at a glance.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-3xl border border-slate-100 bg-slate-50 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar src={member.avatarUrl} fallback={member.name} alt={member.name} />
                      <h3 className="text-lg font-semibold text-slate-900">{member.name}</h3>
                    </div>
                    <Badge tone="sky">{member.department.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {member.jobTitle ?? member.email}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                    <span>{member.role.replaceAll("_", " ")}</span>
                    <span>{member.weeklyCapacityHours}h weekly capacity</span>
                  </div>
                  <div className="mt-5 space-y-2">
                    {member.assignedClients.length ? (
                      member.assignedClients.map((client) => (
                        <div
                          key={client.id}
                          className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-slate-600"
                        >
                          {client.companyName}
                        </div>
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                        No active client assignments.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
