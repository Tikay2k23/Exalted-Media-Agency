import { AgencyTaskPanel } from "@/components/team/agency-task-panel";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { PerformanceTable } from "@/components/team/performance-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTeamViewData } from "@/lib/data/queries";
import { canManageEmployeeTasks } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function TeamPage() {
  const user = await requireUser();
  const data = await getTeamViewData(user);
  const canManageTasks = canManageEmployeeTasks(user.role);

  return (
    <div className="space-y-6">
      <AgencyTaskPanel
        tasks={data.agencyTasks}
        users={data.taskOptions.users}
        clients={data.taskOptions.clients}
        canManageTasks={canManageTasks}
        currentUserId={user.id}
        summary={data.agencyTaskSummary}
      />

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Team Performance</CardTitle>
            <CardDescription>
              Delivery output across the team based on assigned clients and posting work.
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
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{member.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {member.jobTitle ?? member.email}
                  </p>
                </div>
                <Badge tone="sky">{member.department.replaceAll("_", " ")}</Badge>
              </div>
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
