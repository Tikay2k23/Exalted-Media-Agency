import {
  BarChart3,
  BriefcaseBusiness,
  Clock3,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AgencyTaskList } from "@/components/dashboard/agency-task-list";
import { PipelineOverview } from "@/components/dashboard/pipeline-overview";
import { StatCard } from "@/components/dashboard/stat-card";
import { PerformanceTable } from "@/components/team/performance-table";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDashboardData } from "@/lib/data/queries";
import { requireUser } from "@/lib/session";
import { formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData(user);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title="Client accounts"
          value={String(data.metrics.existingClientsCount)}
          description="Accounts currently visible in your workspace."
          icon={BriefcaseBusiness}
        />
        <StatCard
          title="New this month"
          value={String(data.metrics.newClientsCount)}
          description="Accounts added in the last 30 days."
          icon={Sparkles}
        />
        <StatCard
          title="Active accounts"
          value={String(data.metrics.activeClientsCount)}
          description="Live accounts currently marked active."
          icon={BarChart3}
        />
        <StatCard
          title="Open work items"
          value={String(data.metrics.openAgencyTasksCount)}
          description="Internal delivery tasks that still need action."
          icon={Clock3}
        />
        <StatCard
          title="Team utilization"
          value={formatPercent(data.metrics.teamUtilizationRate)}
          description={`${data.metrics.overdueAgencyTasksCount} overdue work item${data.metrics.overdueAgencyTasksCount === 1 ? "" : "s"} currently need attention.`}
          icon={UsersRound}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <PipelineOverview stages={data.pipelineOverview} attentionClients={data.attentionClients} />
        <AgencyTaskList tasks={data.agencyTasks} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Team Workload Summary</CardTitle>
            <CardDescription>
              Capacity, active work, and overdue items across the agency team.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PerformanceTable rows={data.teamPerformance} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Department Load</CardTitle>
              <CardDescription>
                Capacity and booked hours across the digital marketing team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {data.departmentLoad.map((department) => (
                <div
                  key={department.department}
                  className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {department.department.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {department.members} team member
                        {department.members === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge tone="sky">{department.utilizationRate}% utilized</Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">
                    {department.openHours}h booked across {department.capacityHours}h capacity
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <ActivityFeed activities={data.recentActivity} />
        </div>
      </section>
    </div>
  );
}
