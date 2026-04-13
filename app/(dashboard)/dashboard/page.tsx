import {
  BarChart3,
  BriefcaseBusiness,
  ChartNoAxesColumnIncreasing,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AgencyTaskList } from "@/components/dashboard/agency-task-list";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
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
          title="Existing clients"
          value={String(data.metrics.existingClientsCount)}
          description="Active accounts currently visible in your workspace."
          icon={BriefcaseBusiness}
        />
        <StatCard
          title="New clients"
          value={String(data.metrics.newClientsCount)}
          description="Accounts added in the last 30 days."
          icon={Sparkles}
        />
        <StatCard
          title="Fulfillment rate"
          value={formatPercent(data.metrics.fulfillmentRate)}
          description={`${data.metrics.completedPosts} of ${data.metrics.plannedPosts} planned posts are complete.`}
          icon={ChartNoAxesColumnIncreasing}
        />
        <StatCard
          title="Pipeline health"
          value={String(
            data.pipelineOverview.reduce((sum, stage) => sum + stage.count, 0),
          )}
          description="Total accounts distributed across all delivery stages."
          icon={BarChart3}
        />
        <StatCard
          title="Team utilization"
          value={formatPercent(data.metrics.teamUtilizationRate)}
          description={`${data.metrics.openAgencyTasksCount} open internal marketing tasks are currently booked.`}
          icon={UsersRound}
        />
      </section>

      <DashboardCharts
        pipelineOverview={data.pipelineOverview}
        platformBreakdown={data.platformBreakdown}
      />

      <AgencyTaskList tasks={data.agencyTasks} />

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Team Performance Summary</CardTitle>
            <CardDescription>
              Fulfillment progress across assigned clients and live delivery work.
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
