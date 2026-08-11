import Link from "next/link";

import { notFound } from "next/navigation";

import { AgencyTaskPanel } from "@/components/team/agency-task-panel";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { PerformanceTable } from "@/components/team/performance-table";
import type { TaskRow } from "@/components/work/task-types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAuthContext } from "@/lib/authz";
import { getTeamViewData } from "@/lib/data/queries";
import { can, canManageEmployeeTasks } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getAssignedTasks } from "@/lib/tasks/task-queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TeamPage() {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    notFound();
  }

  const [data, work] = await Promise.all([
    getTeamViewData(user),
    getAssignedTasks(actor),
  ]);

  const canManageTasks = canManageEmployeeTasks(user.role);

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

  // What the interface may offer. Every one is checked again in the service
  // before anything is written; this only decides what gets drawn.
  const viewer = {
    id: actor.id,
    canEdit: can(actor, "workItems.edit"),
    canReviewAny: can(actor, "workItems.review"),
    canArchive: can(actor, "workItems.archive"),
    canDelete: can(actor, "workItems.delete"),
    canAssign: can(actor, "workItems.assign"),
  };

  return (
    <div className="space-y-6">
      {/* Weekly updates used to be a top-level menu item competing with four
          other things that also sounded like "the work". It belongs with the
          people it is about. */}
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

      {data.isDegraded ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle>Some team data is temporarily unavailable</CardTitle>
            <CardDescription>
              The workspace stayed online, but one or more team data queries failed. Refresh this
              page shortly to try again.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <AgencyTaskPanel
        tasks={tasks}
        users={data.taskOptions.users}
        clients={data.taskOptions.clients}
        taskClients={work.clients}
        projects={data.taskOptions.projects}
        sops={data.taskOptions.sops}
        canManageTasks={canManageTasks}
        viewer={viewer}
        capped={work.capped}
        serverNow={new Date().toISOString()}
      />

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
    </div>
  );
}
