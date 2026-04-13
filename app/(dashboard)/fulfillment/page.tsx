import { format, isWithinInterval } from "date-fns";
import {
  CalendarRange,
  CheckCircle2,
  FileSearch,
  NotebookPen,
} from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/dashboard/stat-card";
import { FulfillmentTable } from "@/components/fulfillment/fulfillment-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getWeeklyTaskTrackerData } from "@/lib/data/queries";
import { canViewAllAgencyData } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FulfillmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const filters = {
    weekStart: readSearchParam(params.weekStart),
    date: readSearchParam(params.date),
    clientId: readSearchParam(params.clientId),
    search: readSearchParam(params.search),
  };
  const data = await getWeeklyTaskTrackerData(user, filters);
  const canManageAll = canViewAllAgencyData(user.role);
  const today = new Date();
  const defaultEntryDate = data.filters.date
    || (isWithinInterval(today, {
      start: data.week.start,
      end: data.week.end,
    })
      ? format(today, "yyyy-MM-dd")
      : data.filters.weekStart);

  const clientBreakdown = Object.values(
    data.tasks.reduce<
      Record<
        string,
        {
          name: string;
          taskCount: number;
          updateCount: number;
        }
      >
    >((accumulator, task) => {
      const key = task.client?.id ?? "internal";
      const current =
        accumulator[key]
        ?? {
          name: task.client?.companyName ?? "Internal operations",
          taskCount: 0,
          updateCount: 0,
        };

      current.taskCount += 1;
      current.updateCount += task.eodEntries.length;
      accumulator[key] = current;

      return accumulator;
    }, {}),
  ).sort((left, right) => right.taskCount - left.taskCount);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Weekly tasks"
          value={String(data.summary.taskCount)}
          description={`Tasks scheduled for ${data.week.label}.`}
          icon={CalendarRange}
        />
        <StatCard
          title="Tasks with updates"
          value={String(data.summary.tasksWithUpdates)}
          description="Tasks that already have at least one daily EOD update this week."
          icon={NotebookPen}
        />
        <StatCard
          title={data.filters.date ? "Selected date updates" : "Weekly EOD logs"}
          value={String(data.summary.selectedDateEntryCount ?? data.summary.totalEodEntries)}
          description={
            data.filters.date
              ? `Daily EOD entries logged for ${formatDate(data.filters.date)}.`
              : "All daily EOD entries attached to this week's tasks."
          }
          icon={FileSearch}
        />
        <StatCard
          title="Completed tasks"
          value={String(data.summary.completedCount)}
          description={`${data.summary.clientsInView} client account${data.summary.clientsInView === 1 ? "" : "s"} represented in the current view.`}
          icon={CheckCircle2}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Weekly Filters</CardTitle>
          <CardDescription>
            Search tasks, assignees, clients, briefs, and EOD notes. Filter the tracker by week, specific date, or client to review delivery fast.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.35fr_0.8fr_0.8fr_0.95fr_auto_auto]">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600">Search</span>
              <Input
                name="search"
                defaultValue={data.filters.search}
                placeholder="Find tasks, assignees, clients, notes, or EOD entries"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600">Week of</span>
              <Input
                name="weekStart"
                type="date"
                defaultValue={data.filters.weekStart}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600">Specific date</span>
              <Input
                name="date"
                type="date"
                defaultValue={data.filters.date}
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600">Client</span>
              <Select name="clientId" defaultValue={data.filters.clientId}>
                <option value="ALL">All visible clients</option>
                {data.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.companyName}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex items-end">
              <Button type="submit" className="w-full xl:w-auto">
                Apply filters
              </Button>
            </div>
            <div className="flex items-end">
              <Link
                href="/fulfillment"
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 xl:w-auto"
              >
                Reset
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Task Tracker</CardTitle>
            <CardDescription>
              Review work for {data.week.label}, open a task, and keep each daily EOD log attached to the task it belongs to.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FulfillmentTable
              tasks={data.tasks}
              currentUserId={user.id}
              canManageAll={canManageAll}
              selectedDate={data.filters.date}
              defaultEntryDate={defaultEntryDate}
              autoExpand={Boolean(data.filters.date || data.filters.search || !canManageAll)}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Week View</CardTitle>
              <CardDescription>
                Daily activity for the selected week so managers can spot quiet days, overdue work, and update gaps quickly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.dailyDigest.map((day) => (
                <div
                  key={day.date.toISOString()}
                  className={`rounded-2xl border px-4 py-4 ${
                    data.filters.date === format(day.date, "yyyy-MM-dd")
                      ? "border-sky-200 bg-sky-50"
                      : "border-slate-100 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{day.label}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatDate(day.date)}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-slate-600">
                      {day.updates} update{day.updates === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                    <span>{day.tasksTouched} task{day.tasksTouched === 1 ? "" : "s"} touched</span>
                    <span>{day.dueTasks} due</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Client Focus</CardTitle>
              <CardDescription>
                Task and update volume by client for the current filtered view.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {clientBreakdown.length ? (
                clientBreakdown.map((client) => (
                  <div
                    key={client.name}
                    className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">{client.name}</p>
                      <p className="text-sm font-medium text-slate-500">
                        {client.taskCount} task{client.taskCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {client.updateCount} EOD update{client.updateCount === 1 ? "" : "s"} logged
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  No client-linked work is visible in this view.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
