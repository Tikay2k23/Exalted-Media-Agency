"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Flag,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { AddTaskDialog } from "@/components/clients/add-task-dialog";
import { RowMenu } from "@/components/work/row-menu";
import { TaskDetailModal } from "@/components/work/task-detail-modal";
import type {
  TaskComment,
  TaskEvent,
  TaskRow,
  ViewerCapabilities,
} from "@/components/work/task-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  type WorkMetricKey,
  type WorkTask,
  biggestRisk,
  eodState,
  matchesMetric,
  oldestOverdue,
  teamOnAccount,
  workMetrics,
} from "@/lib/clients/client-work";
import { matchesSearch } from "@/lib/tasks/task-filters";
import { cn, formatDate, formatDateTime, formatEnumLabel } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The task row, plus the two things the Work tab shows that My Work does not.
 *
 * Deliberately an extension of TaskRow rather than a shape of its own: it is
 * the same record, read the same way, and the task drawer takes it unchanged.
 */
export interface ClientWorkTask extends TaskRow {
  /** ISO date of the most recent EOD entry against this task. */
  latestEodDate: string | null;
  /** Prerequisites that have not finished yet. */
  unmetDependencies: number;
  /** What the assignee last reported in an EOD, 0-100, if they reported one. */
  reportedProgress: number | null;
}

export interface WorkProject {
  id: string;
  name: string;
  status: string;
  ownerName: string | null;
  progress: number;
  taskCount: number;
  completedCount: number;
  overdueCount: number;
  blockedCount: number;
  nextMilestone: { name: string; dueAt: string | null } | null;
}

export interface WorkEodEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  userName: string;
  entryDate: string;
  hoursWorked: number | null;
  progressNote: string | null;
  blockers: string | null;
  nextAction: string | null;
  createdAt: string;
}

export interface WorkActivityEntry {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* Small presentational pieces                                                */
/* -------------------------------------------------------------------------- */

const STATUS_TONE: Record<string, string> = {
  BACKLOG: "bg-slate-100 text-slate-600",
  TODO: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-indigo-50 text-indigo-700",
  WAITING_CLIENT: "bg-amber-50 text-amber-700",
  BLOCKED: "bg-rose-50 text-rose-700",
  NEEDS_REVIEW: "bg-orange-50 text-orange-700",
  REVISION_REQUIRED: "bg-orange-50 text-orange-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  DONE: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

const PRIORITY_TONE: Record<string, string> = {
  URGENT: "bg-rose-50 text-rose-700",
  HIGH: "bg-rose-50 text-rose-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

const METRIC_ICONS: Record<WorkMetricKey, typeof ClipboardList> = {
  active: ClipboardList,
  dueSoon: Clock,
  overdue: AlertCircle,
  blocked: ShieldAlert,
  needsReview: Users,
  completedThisMonth: CheckCircle2,
};

const METRIC_TONE: Record<WorkMetricKey, string> = {
  active: "bg-indigo-50 text-indigo-600",
  dueSoon: "bg-amber-50 text-amber-600",
  overdue: "bg-rose-50 text-rose-600",
  blocked: "bg-violet-50 text-violet-600",
  needsReview: "bg-orange-50 text-orange-600",
  completedThisMonth: "bg-emerald-50 text-emerald-600",
};

function Initials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
      {initials || "?"}
    </span>
  );
}

/**
 * How far along a task is.
 *
 * The assignee's own last end-of-day figure when they gave one, because they
 * are the person who knows. Otherwise the state the task is in, which is coarse
 * but never wrong: a bar cannot read 90% beside a task nobody has started, and
 * a number nobody maintains is decoration.
 */
export function progressFor(task: ClientWorkTask): number {
  const closed = task.status === "DONE" || task.status === "APPROVED";

  if (!closed && task.reportedProgress !== null) {
    return Math.min(100, Math.max(0, task.reportedProgress));
  }

  switch (task.status) {
    case "APPROVED":
    case "DONE":
      return 100;
    case "NEEDS_REVIEW":
      return 90;
    case "REVISION_REQUIRED":
      return 70;
    case "IN_PROGRESS":
      return 45;
    case "WAITING_CLIENT":
    case "BLOCKED":
      return 30;
    case "CANCELLED":
      return 0;
    default:
      return 0;
  }
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full", value === 100 ? "bg-emerald-500" : "bg-indigo-500")}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-slate-500">{value}%</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The tab                                                                    */
/* -------------------------------------------------------------------------- */

export function ClientWork({
  clientId,
  companyName,
  timezone,
  tasks,
  projects,
  eodEntries,
  activity,
  assignees,
  viewer,
  serverNow,
}: {
  clientId: string;
  companyName: string;
  /** The account's own timezone, never the reader's assumption about it. */
  timezone: string | null;
  tasks: ClientWorkTask[];
  projects: WorkProject[];
  eodEntries: WorkEodEntry[];
  activity: WorkActivityEntry[];
  assignees: { id: string; name: string }[];
  viewer: ViewerCapabilities;
  serverNow: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [metric, setMetric] = useState<WorkMetricKey | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignee, setAssignee] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("dueDate");
  const [page, setPage] = useState(1);

  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState<{
    comments: TaskComment[];
    activity: TaskEvent[];
    eod: never[];
  }>({ comments: [], activity: [], eod: [] });
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadVersion, setThreadVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [drawer, setDrawer] = useState<"team" | "eod" | "workload" | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const now = useMemo(() => new Date(serverNow), [serverNow]);
  const pageSize = 8;

  // Typing should not fire a render per keystroke on a long task list.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);

    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => setPage(1), [metric, debounced, status, priority, assignee, category, sort]);

  /** The same records, in the shape the derivation module reads. */
  const workTasks: WorkTask[] = useMemo(
    () =>
      tasks.map((task) => ({
        id: task.id,
        title: task.title,
        note: task.note,
        status: task.status,
        priority: task.priority,
        category: task.category,
        dueDate: task.dueDate,
        startDate: task.startDate,
        completedAt: task.completedAt,
        archivedAt: task.archivedAt,
        assignee: task.assignedTo
          ? { id: task.assignedTo.id, name: task.assignedTo.name, role: null }
          : null,
        reviewerId: task.reviewer?.id ?? null,
        projectId: task.project?.id ?? null,
        projectName: task.project?.name ?? null,
        blocker: task.blocker,
        requiresApproval: task.requiresApproval,
        latestEodDate: task.latestEodDate,
        unmetDependencies: task.unmetDependencies,
      })),
    [tasks],
  );

  const metrics = useMemo(() => workMetrics(workTasks, now), [workTasks, now]);
  const byId = useMemo(() => new Map(workTasks.map((task) => [task.id, task])), [workTasks]);

  const filtered = useMemo(() => {
    const rows = tasks.filter((task) => {
      const derived = byId.get(task.id)!;

      if (metric && !matchesMetric(derived, metric, now)) return false;
      if (status && task.status !== status) return false;
      if (priority && task.priority !== priority) return false;
      if (assignee && task.assignedTo?.id !== assignee) return false;
      if (category && task.category !== category) return false;
      if (debounced && !matchesSearch(task, debounced)) return false;

      return true;
    });

    const order = [...rows];

    order.sort((a, b) => {
      switch (sort) {
        case "priority": {
          const rank = ["URGENT", "HIGH", "MEDIUM", "LOW"];

          return rank.indexOf(a.priority) - rank.indexOf(b.priority);
        }
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "progress":
          return progressFor(b) - progressFor(a);
        case "assignee":
          return (a.assignedTo?.name ?? "").localeCompare(b.assignedTo?.name ?? "");
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
    });

    return order;
  }, [tasks, byId, metric, status, priority, assignee, category, debounced, sort, now]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openTask = tasks.find((task) => task.id === openId) ?? null;

  /* --- the task drawer, on the same endpoints My Work uses ---------------- */
  useEffect(() => {
    if (!openId) return;

    let cancelled = false;

    setThreadLoading(true);

    Promise.all([
      fetch(`/api/employee-tasks/${openId}/comments`).then((response) =>
        response.ok ? response.json() : { comments: [], activity: [] },
      ),
      fetch(`/api/employee-tasks/${openId}/eod`).then((response) =>
        response.ok ? response.json() : { entries: [] },
      ),
    ])
      .then(([conversation, eod]) => {
        if (cancelled) return;

        setThread({
          comments: conversation.comments ?? [],
          activity: conversation.activity ?? [],
          eod: eod.entries ?? [],
        });
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [openId, threadVersion]);

  async function runAction(body: Record<string, unknown>) {
    if (!openId || busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/employee-tasks/${openId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => null);

        setError(failure?.error ?? "We couldn't update the task. No changes were made.");
        setBusy(false);
        return;
      }

      setThreadVersion((version) => version + 1);
      startTransition(() => router.refresh());
    } catch {
      setError("We couldn't reach the server. No changes were made.");
    } finally {
      setBusy(false);
    }
  }

  async function postComment(body: string) {
    if (!openId) return;

    await fetch(`/api/employee-tasks/${openId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    setThreadVersion((version) => version + 1);
  }

  /** Row actions, run through the same transition endpoint as the drawer. */
  async function quickAction(taskId: string, body: Record<string, unknown>) {
    setBusy(true);

    await fetch(`/api/employee-tasks/${taskId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setBusy(false);
    startTransition(() => router.refresh());
  }

  function refresh() {
    setRefreshing(true);
    startTransition(() => {
      router.refresh();
      setTimeout(() => setRefreshing(false), 600);
    });
  }

  const overdueInsight = useMemo(() => oldestOverdue(workTasks, now), [workTasks, now]);
  const team = useMemo(() => teamOnAccount(workTasks, now), [workTasks, now]);
  const risk = useMemo(() => biggestRisk(workTasks, now), [workTasks, now]);

  const nextMilestone = useMemo(() => {
    const upcoming = projects
      .map((project) => ({ project, milestone: project.nextMilestone }))
      .filter((entry) => entry.milestone?.dueAt)
      .sort(
        (a, b) =>
          new Date(a.milestone!.dueAt!).getTime() - new Date(b.milestone!.dueAt!).getTime(),
      );

    return upcoming[0] ?? null;
  }, [projects]);

  const categories = useMemo(
    () => [...new Set(tasks.map((task) => task.category))].sort(),
    [tasks],
  );
  const statuses = useMemo(() => [...new Set(tasks.map((task) => task.status))].sort(), [tasks]);

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------- the six cards ---- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map((card) => {
          const Icon = METRIC_ICONS[card.key];
          const isActive = metric === card.key;

          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setMetric(isActive ? null : card.key)}
              aria-pressed={isActive}
              className={cn(
                "flex items-center gap-3 rounded-2xl border bg-white p-4 text-left transition",
                isActive
                  ? "border-indigo-300 ring-2 ring-indigo-100"
                  : "border-slate-200 hover:border-slate-300",
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  METRIC_TONE[card.key],
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-semibold tabular-nums text-slate-950">
                  {card.value}
                </span>
                <span className="block truncate text-xs text-slate-600">{card.label}</span>
                <span className="block text-[11px] text-indigo-600">
                  {isActive ? "Filtering" : card.caption}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ------------------------------------------- delivery work ----- */}
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-950">Delivery Work</h2>
            {viewer.canEdit ? (
              <Button type="button" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add Task
              </Button>
            ) : null}
          </header>

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <div className="relative min-w-[180px] flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tasks..."
                aria-label="Search tasks"
                className="h-9 pl-8 text-xs"
              />
            </div>

            <Select
              aria-label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-9 w-auto text-xs"
            >
              <option value="">Status</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {formatEnumLabel(value)}
                </option>
              ))}
            </Select>

            <Select
              aria-label="Priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              className="h-9 w-auto text-xs"
            >
              <option value="">Priority</option>
              {["URGENT", "HIGH", "MEDIUM", "LOW"].map((value) => (
                <option key={value} value={value}>
                  {formatEnumLabel(value)}
                </option>
              ))}
            </Select>

            <Select
              aria-label="Assignee"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              className="h-9 w-auto text-xs"
            >
              <option value="">Assignee</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>

            <Select
              aria-label="Category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-9 w-auto text-xs"
            >
              <option value="">Category</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {formatEnumLabel(value)}
                </option>
              ))}
            </Select>

            <Select
              aria-label="Sort by"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="h-9 w-auto text-xs"
            >
              <option value="dueDate">Sort by: Due Date</option>
              <option value="priority">Sort by: Priority</option>
              <option value="newest">Sort by: Newest</option>
              <option value="oldest">Sort by: Oldest</option>
              <option value="progress">Sort by: Progress</option>
              <option value="assignee">Sort by: Assignee</option>
              <option value="status">Sort by: Status</option>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-slate-600">
                {tasks.length === 0
                  ? "No work has been created for this client yet."
                  : "No tasks match these filters."}
              </p>
              {tasks.length === 0 && viewer.canEdit ? (
                <Button type="button" size="sm" className="mt-3" onClick={() => setAdding(true)}>
                  Add Task
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              {/* Desktop: a dense table. Mobile: one card per task. */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[860px] text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2 font-medium">Task</th>
                      <th className="px-2 py-2 font-medium">Category</th>
                      <th className="px-2 py-2 font-medium">Assignee</th>
                      <th className="px-2 py-2 font-medium">Due Date</th>
                      <th className="px-2 py-2 font-medium">Priority</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Progress</th>
                      <th className="px-2 py-2 font-medium">EOD</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((task) => {
                      const derived = byId.get(task.id)!;
                      const late = matchesMetric(derived, "overdue", now);
                      const eod = eodState(derived, now);

                      return (
                        <tr
                          key={task.id}
                          className="border-b border-slate-50 align-middle transition hover:bg-slate-50/70"
                        >
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => setOpenId(task.id)}
                              className="text-left"
                            >
                              <span className="block text-xs font-medium text-slate-950 hover:text-indigo-700">
                                {task.title}
                              </span>
                              <span className="block text-[11px] text-slate-500">
                                {task.project?.name ?? formatEnumLabel(task.category)}
                              </span>
                            </button>
                          </td>
                          <td className="px-2 py-2.5 text-[11px] text-slate-600">
                            {formatEnumLabel(task.category)}
                          </td>
                          <td className="px-2 py-2.5">
                            {task.assignedTo ? (
                              <span className="flex items-center gap-1.5">
                                <Initials name={task.assignedTo.name} />
                                <span className="text-[11px] text-slate-700">
                                  {task.assignedTo.name}
                                </span>
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">Unassigned</span>
                            )}
                          </td>
                          <td
                            className={cn(
                              "px-2 py-2.5 text-[11px]",
                              late ? "font-semibold text-rose-600" : "text-slate-600",
                            )}
                          >
                            {formatDate(task.dueDate)}
                          </td>
                          <td className="px-2 py-2.5">
                            <Badge className={cn("text-[10px]", PRIORITY_TONE[task.priority])}>
                              {formatEnumLabel(task.priority)}
                            </Badge>
                          </td>
                          <td className="px-2 py-2.5">
                            <Badge className={cn("text-[10px]", STATUS_TONE[task.status])}>
                              {formatEnumLabel(task.status)}
                            </Badge>
                          </td>
                          <td className="px-2 py-2.5">
                            <ProgressBar value={progressFor(task)} />
                          </td>
                          <td className="px-2 py-2.5">
                            <EodIcon state={eod} onClick={() => setOpenId(task.id)} />
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <RowMenu
                              label={`Actions for ${task.title}`}
                              items={rowMenuItems(task, viewer, {
                                open: () => setOpenId(task.id),
                                act: (body) => void quickAction(task.id, body),
                              })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-slate-100 lg:hidden">
                {visible.map((task) => {
                  const derived = byId.get(task.id)!;

                  return (
                    <li key={task.id} className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setOpenId(task.id)}
                        className="block w-full text-left"
                      >
                        <span className="block text-xs font-medium text-slate-950">
                          {task.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">
                          {task.project?.name ?? formatEnumLabel(task.category)}
                        </span>
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge className={cn("text-[10px]", STATUS_TONE[task.status])}>
                          {formatEnumLabel(task.status)}
                        </Badge>
                        <Badge className={cn("text-[10px]", PRIORITY_TONE[task.priority])}>
                          {formatEnumLabel(task.priority)}
                        </Badge>
                        <span
                          className={cn(
                            "text-[11px]",
                            matchesMetric(derived, "overdue", now)
                              ? "font-semibold text-rose-600"
                              : "text-slate-500",
                          )}
                        >
                          {formatDate(task.dueDate)}
                        </span>
                        {task.assignedTo ? (
                          <span className="text-[11px] text-slate-500">
                            {task.assignedTo.name}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-slate-500">
                <span>
                  Showing {(page - 1) * pageSize + 1} to{" "}
                  {Math.min(page * pageSize, filtered.length)} of {filtered.length} task
                  {filtered.length === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page === 1}
                    aria-label="Previous page"
                    className="rounded-lg border border-slate-200 p-1 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                    <button
                      key={number}
                      type="button"
                      onClick={() => setPage(number)}
                      aria-current={page === number ? "page" : undefined}
                      className={cn(
                        "min-w-6 rounded-lg border px-1.5 py-0.5 tabular-nums",
                        page === number
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : "border-slate-200",
                      )}
                    >
                      {number}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={page === pageCount}
                    aria-label="Next page"
                    className="rounded-lg border border-slate-200 p-1 disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </span>
              </footer>
            </>
          )}
        </section>

        {/* ------------------------------------------------- right rail --- */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-indigo-600" aria-hidden />
              <h2 className="text-sm font-semibold text-slate-950">Work Insights</h2>
            </div>

            <ul className="mt-3 space-y-3">
              <li>
                <button
                  type="button"
                  onClick={() => setMetric("active")}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span>
                    <span className="block text-[11px] text-slate-500">Total Open Work</span>
                    <span className="block text-xs font-semibold text-slate-900">
                      {metrics[0].value} task{metrics[0].value === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              </li>

              {overdueInsight ? (
                <li>
                  <button
                    type="button"
                    onClick={() => setOpenId(overdueInsight.taskId)}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
                    <span>
                      <span className="block text-[11px] text-slate-500">Oldest Overdue Task</span>
                      <span className="block text-xs font-semibold text-slate-900">
                        {overdueInsight.title}
                      </span>
                      <span className="block text-[11px] text-rose-600">
                        Overdue by {overdueInsight.days} day{overdueInsight.days === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                </li>
              ) : null}

              {nextMilestone?.milestone ? (
                <li className="flex items-start gap-2">
                  <Flag className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" aria-hidden />
                  <span>
                    <span className="block text-[11px] text-slate-500">Next Milestone Due</span>
                    <span className="block text-xs font-semibold text-slate-900">
                      {nextMilestone.project.name} — {nextMilestone.milestone.name}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      {formatDate(nextMilestone.milestone.dueAt!)}
                    </span>
                  </span>
                </li>
              ) : null}

              <li>
                <span className="flex items-start gap-2">
                  <ShieldAlert
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      risk ? "text-amber-500" : "text-emerald-500",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] text-slate-500">Biggest Delivery Risk</span>
                    {risk ? (
                      <button
                        type="button"
                        onClick={() => setMetric(risk.filter)}
                        className="text-left"
                      >
                        <span className="block text-xs font-semibold text-slate-900">
                          {risk.headline}
                        </span>
                        <span className="block text-[11px] text-amber-700">{risk.detail}</span>
                      </button>
                    ) : (
                      <span className="block text-xs text-slate-600">
                        No delivery risks detected.
                      </span>
                    )}
                  </span>
                </span>
              </li>

              {team.length > 0 ? (
                <li className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span>
                    <span className="block text-[11px] text-slate-500">
                      Team Working on This Account
                    </span>
                    <button
                      type="button"
                      onClick={() => setDrawer("team")}
                      className="mt-1 flex items-center gap-1"
                    >
                      {team.slice(0, 4).map((member) => (
                        <Initials key={member.id} name={member.name} />
                      ))}
                      {team.length > 4 ? (
                        <span className="text-[11px] text-slate-500">+{team.length - 4}</span>
                      ) : null}
                      <span className="ml-1 text-[11px] font-medium text-indigo-600">
                        View Team
                      </span>
                    </button>
                  </span>
                </li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-950">Quick Links</h2>
            <ul className="mt-2 space-y-1 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => setDrawer("eod")}
                  className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-indigo-600 transition hover:bg-slate-50"
                >
                  View All EODs
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
              <li>
                <a
                  href="/fulfillment"
                  className="flex items-center justify-between rounded-lg px-1 py-1.5 text-indigo-600 transition hover:bg-slate-50"
                >
                  Open Weekly Work
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => setDrawer("workload")}
                  className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-indigo-600 transition hover:bg-slate-50"
                >
                  Workload Report
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-950">Recent Work Activity</h2>
            {activity.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No recent work activity.</p>
            ) : (
              <ul className="mt-2 space-y-2.5">
                {activity.slice(0, 5).map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2">
                    <Initials name={entry.actorName ?? "System"} />
                    <span className="min-w-0">
                      <span className="block text-[11px] leading-snug text-slate-700">
                        {entry.action}
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        {formatDateTime(entry.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* ---------------------------------------------- delivery projects -- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-950">Delivery Projects</h2>

        {projects.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No delivery projects created yet.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  setMetric(null);
                  setSearch(project.name);
                }}
                className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-300"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-slate-950">
                    {project.name}
                  </span>
                  <Badge className="text-[10px]">{formatEnumLabel(project.status)}</Badge>
                </span>
                <span className="mt-1 block text-[11px] text-slate-500">
                  Owner {project.ownerName ?? "unassigned"}
                </span>

                <span className="mt-2 block">
                  <ProgressBar value={project.progress} />
                </span>

                <span className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-slate-600">
                  <span>
                    <span className="block text-slate-400">Tasks</span>
                    {project.taskCount}
                  </span>
                  <span>
                    <span className="block text-slate-400">Completed</span>
                    {project.completedCount}
                  </span>
                  <span>
                    <span className="block text-slate-400">Overdue</span>
                    <span className={project.overdueCount > 0 ? "text-rose-600" : undefined}>
                      {project.overdueCount}
                    </span>
                  </span>
                </span>

                {project.nextMilestone ? (
                  <span className="mt-2 block text-[11px] text-slate-500">
                    Next: {project.nextMilestone.name}
                    {project.nextMilestone.dueAt
                      ? ` · ${formatDate(project.nextMilestone.dueAt)}`
                      : ""}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>All times shown in {timezone ?? "your local time"}</span>
        <span className="flex items-center gap-3">
          <span>Last updated {formatDateTime(serverNow)}</span>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
              aria-hidden
            />
            Refresh
          </button>
        </span>
      </footer>

      {/* ------------------------------------------------------ overlays -- */}
      {adding ? (
        <AddTaskDialog
          clientId={clientId}
          companyName={companyName}
          assignees={assignees}
          onClose={() => setAdding(false)}
        />
      ) : null}

      {openTask ? (
        <TaskDetailModal
          task={openTask}
          viewer={viewer}
          comments={thread.comments}
          activity={thread.activity}
          eodEntries={thread.eod}
          loading={threadLoading}
          onClose={() => setOpenId(null)}
          onAction={runAction}
          onComment={postComment}
          onEodSaved={() => setThreadVersion((version) => version + 1)}
          busy={busy}
          error={error}
        />
      ) : null}

      {drawer ? (
        <SideDrawer
          title={
            drawer === "team"
              ? "Team on this account"
              : drawer === "eod"
                ? "End-of-day updates"
                : "Workload report"
          }
          onClose={() => setDrawer(null)}
        >
          {drawer === "eod" ? (
            eodEntries.length === 0 ? (
              <p className="text-xs text-slate-500">No EOD updates submitted yet.</p>
            ) : (
              <ul className="space-y-3">
                {eodEntries.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-900">{entry.taskTitle}</p>
                    <p className="text-[11px] text-slate-500">
                      {entry.userName} · {formatDate(entry.entryDate)}
                      {entry.hoursWorked !== null ? ` · ${entry.hoursWorked}h` : ""}
                    </p>
                    {entry.progressNote ? (
                      <p className="mt-1 text-[11px] text-slate-700">{entry.progressNote}</p>
                    ) : null}
                    {entry.blockers ? (
                      <p className="mt-1 text-[11px] text-rose-600">Blocked: {entry.blockers}</p>
                    ) : null}
                    {entry.nextAction ? (
                      <p className="mt-1 text-[11px] text-slate-500">Next: {entry.nextAction}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <table className="w-full text-left text-[11px]">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 font-medium">Person</th>
                  <th className="py-1 font-medium">Open</th>
                  <th className="py-1 font-medium">Due soon</th>
                  <th className="py-1 font-medium">Overdue</th>
                  <th className="py-1 font-medium">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {team.map((member) => (
                  <tr key={member.id} className="border-t border-slate-100">
                    <td className="py-1.5 text-slate-800">{member.name}</td>
                    <td className="py-1.5 tabular-nums">{member.open}</td>
                    <td className="py-1.5 tabular-nums">{member.dueSoon}</td>
                    <td
                      className={cn(
                        "py-1.5 tabular-nums",
                        member.overdue > 0 && "font-semibold text-rose-600",
                      )}
                    >
                      {member.overdue}
                    </td>
                    <td className="py-1.5 tabular-nums">{member.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {drawer === "team" && team.length === 0 ? (
            <p className="text-xs text-slate-500">Nobody is assigned work on this account yet.</p>
          ) : null}
        </SideDrawer>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bits                                                                       */
/* -------------------------------------------------------------------------- */

function EodIcon({
  state,
  onClick,
}: {
  state: ReturnType<typeof eodState>;
  onClick: () => void;
}) {
  if (state === "none") {
    return <span className="text-[11px] text-slate-300">—</span>;
  }

  const label =
    state === "submitted"
      ? "EOD submitted today"
      : state === "expected"
        ? "EOD expected today"
        : "EOD overdue";

  const Icon = state === "submitted" ? CheckCircle2 : state === "expected" ? Clock : AlertCircle;
  const tone =
    state === "submitted"
      ? "text-emerald-500"
      : state === "expected"
        ? "text-amber-500"
        : "text-rose-500";

  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}>
      <Icon className={cn("h-4 w-4", tone)} aria-hidden />
    </button>
  );
}

/** The row menu, built from what this viewer may actually do to this task. */
function rowMenuItems(
  task: ClientWorkTask,
  viewer: ViewerCapabilities,
  handlers: { open: () => void; act: (body: Record<string, unknown>) => void },
) {
  const items: { label: string; onSelect: () => void; tone?: "danger" }[] = [
    { label: "Open task", onSelect: handlers.open },
  ];

  const closed = ["DONE", "APPROVED", "CANCELLED"].includes(task.status);

  if (viewer.canEdit && !closed) {
    if (task.status !== "IN_PROGRESS") {
      items.push({ label: "Start task", onSelect: () => handlers.act({ status: "IN_PROGRESS" }) });
    }

    if (task.status !== "WAITING_CLIENT") {
      items.push({
        label: "Mark waiting on client",
        onSelect: () => handlers.act({ status: "WAITING_CLIENT" }),
      });
    }

    if (task.status !== "BLOCKED") {
      items.push({ label: "Add blocker", onSelect: () => handlers.act({ status: "BLOCKED" }) });
    } else {
      items.push({ label: "Resolve blocker", onSelect: () => handlers.act({ status: "IN_PROGRESS" }) });
    }

    if (task.status !== "NEEDS_REVIEW") {
      items.push({
        label: "Submit for review",
        onSelect: () => handlers.act({ status: "NEEDS_REVIEW" }),
      });
    }
  }

  if (viewer.canReviewAny && task.status === "NEEDS_REVIEW") {
    items.push({ label: "Approve", onSelect: () => handlers.act({ review: "APPROVE" }) });
    items.push({
      label: "Request revision",
      onSelect: () => handlers.act({ review: "REQUEST_REVISION" }),
    });
  }

  if (viewer.canArchive && !closed) {
    items.push({
      label: "Cancel task",
      tone: "danger",
      onSelect: () => handlers.act({ status: "CANCELLED" }),
    });
  }

  return items;
}

function SideDrawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/20" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
