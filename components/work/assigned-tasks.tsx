"use client";

import { Download, ListFilter, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  CATEGORY_GUIDES,
  PRIORITY_OPTIONS,
  categoryGuide,
  priorityTone,
  statusLabel,
  statusTone,
} from "@/lib/tasks/task-catalogue";
import { buildTaskCsv, taskCsvFilename } from "@/lib/tasks/task-csv";
import {
  DATE_PRESETS,
  EMPTY_FILTERS,
  SORT_OPTIONS,
  TASK_TABS,
  type DatePreset,
  type SortKey,
  type TaskFilterState,
  type TaskTab,
  applyFilters,
  countByTab,
  hasActiveFilters,
  relativeDue,
  summarise,
} from "@/lib/tasks/task-filters";
import { formatEnumLabel } from "@/lib/utils";

import type { MyWorkView } from "@/lib/tasks/my-work-view";

import { MyWorkOverview } from "./my-work-overview";
import { RowMenu } from "./row-menu";
import { TaskDetailModal } from "./task-detail-modal";
import type { TaskComment, TaskEvent, TaskRow, ViewerCapabilities } from "./task-types";

const FILTER_STATUSES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "BLOCKED",
  "NEEDS_REVIEW",
  "REVISION_REQUIRED",
  "APPROVED",
  "DONE",
];

const PAGE_SIZES = [10, 25, 50];

function downloadCsv(csv: string, filename: string) {
  // The byte order mark stops Excel mangling anything non-ASCII in a client
  // name, which it does silently and which nobody notices until a report goes
  // out with a broken company on it.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

/**
 * My Assigned Tasks.
 *
 * The whole screen runs in the browser off one server read, because searching
 * and filtering your own work should feel like nothing at all - a round trip
 * per keystroke is how a filter box gets abandoned. The server still decides
 * which rows arrive, and every action still asks it again.
 */
export function AssignedTasks({
  tasks,
  clients,
  viewer,
  capped,
  serverNow,
  heading = "All My Tasks",
  identity,
  overview,
  recentActivity,
  initialTaskId,
  initialTodayOnly,
}: {
  tasks: TaskRow[];
  clients: { id: string; companyName: string }[];
  viewer: ViewerCapabilities;
  capped: boolean;
  /** When the server rendered. Seeds the clock so the first paint has counts. */
  serverNow: string;
  /** Heading on the detailed table below the overview. */
  heading?: string;
  /** Who is looking, for the page header. Derived from the session, never typed. */
  identity: { eyebrow: string; title: string; subtitle: string };
  /** The daily overview, derived from these same rows on the server. */
  overview: MyWorkView;
  /** Recent events on this person's work. */
  recentActivity: TaskEvent[];
  /** Open straight onto one task, so a link from elsewhere lands on it. */
  initialTaskId?: string | null;
  /** Arrive with the daily focus filter already on. */
  initialTodayOnly?: boolean;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<TaskFilterState>(
    initialTodayOnly ? { ...EMPTY_FILTERS, todayOnly: true } : EMPTY_FILTERS,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // Seeded from the link rather than set in an effect, so a task arrived at
  // from the dashboard is open on the first paint instead of flashing shut.
  const [openId, setOpenId] = useState<string | null>(initialTaskId ?? null);
  const [exportOpen, setExportOpen] = useState(false);
  const [thread, setThread] = useState<{
    taskId: string;
    comments: TaskComment[];
    activity: TaskEvent[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [showFilters, setShowFilters] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);

  /** Takes the reader down to the table, for actions that act on it. */
  function jumpToTable() {
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /*
   * The clock is seeded from the server's timestamp rather than read during
   * render. Read during render, the server pass and the browser pass would
   * disagree about what "overdue" means and React would rightly complain that
   * the same input gave two answers. Seeded, the first paint already has real
   * counts on it; the effect then moves it to the reader's own clock and keeps
   * it ticking, so "2 days left" becomes "1 day left" without a reload.
   */
  const [now, setNow] = useState(() => new Date(serverNow));

  useEffect(() => {
    const sync = () => setNow(new Date());
    // Deferred rather than called straight away: hydration has to finish
    // against the server's timestamp first, or the two passes disagree.
    const initial = setTimeout(sync, 0);
    const timer = setInterval(sync, 60_000);

    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);

  const summary = useMemo(() => summarise(tasks, now), [tasks, now]);

  const tabCounts = useMemo(() => countByTab(tasks), [tasks]);

  const filtered = useMemo(
    () => applyFilters(tasks, filters, now),
    [tasks, filters, now],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const openTask = tasks.find((task) => task.id === openId) ?? null;

  useEffect(() => {
    if (!exportOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [exportOpen]);

  useEffect(() => {
    if (!openId) return;

    let cancelled = false;
    const taskId = openId;

    fetch(`/api/employee-tasks/${taskId}/comments`)
      .then((response) => (response.ok ? response.json() : Promise.reject(response)))
      .then((data: { comments: TaskComment[]; activity: TaskEvent[] }) => {
        if (cancelled) return;
        setThread({ taskId, comments: data.comments, activity: data.activity });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the thread for this task.");
      });

    return () => {
      cancelled = true;
    };
  }, [openId]);

  /*
   * Loading is worked out from what has arrived rather than tracked in its own
   * flag. A flag has to be set true and false in the right order from three
   * places; this cannot get out of step with the data it describes.
   */
  const loaded = thread?.taskId === openId ? thread : null;
  const threadLoading = Boolean(openId) && !loaded;
  const comments = loaded?.comments ?? [];
  const activity = loaded?.activity ?? [];

  /** Opening a task clears whatever the last one complained about. */
  function open(taskId: string | null) {
    setOpenId(taskId);
    setError(null);
  }

  /*
   * Narrowing the list sends the reader back to page one. Done here rather than
   * in an effect watching the filters, because it is a consequence of the click
   * and belongs with it - an effect would render page four of a one-page list
   * first and correct it afterwards.
   */
  function update<K extends keyof TaskFilterState>(key: K, value: TaskFilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  async function runAction(body: Record<string, unknown>) {
    if (!openId) return;

    setBusy(true);
    setError(null);

    const isDelete = body.action === "delete";

    const response = await fetch(
      isDelete ? `/api/employee-tasks/${openId}` : `/api/employee-tasks/${openId}/transition`,
      {
        method: isDelete ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        ...(isDelete ? {} : { body: JSON.stringify(body) }),
      },
    );

    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    setBusy(false);

    if (!response.ok) {
      setError(data?.error ?? "That didn't go through.");
      return;
    }

    if (isDelete) setOpenId(null);

    // The rows came from the server, so the server is what refreshes them.
    startTransition(() => router.refresh());
  }

  /*
   * The completed export reaches past what is on screen, so it has to come from
   * the server. Fetched rather than linked: the response is a download, and a
   * link to an API route would have Next try to route to it.
   */
  async function exportCompleted() {
    setError(null);

    const response = await fetch("/api/employee-tasks/export");

    if (!response.ok) {
      setError("That export didn't come through.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = taskCsvFilename("completed");
    anchor.click();

    URL.revokeObjectURL(url);
  }

  /** Picking a task up from the row menu, without opening it first. */
  async function startTask(taskId: string) {
    open(taskId);

    const response = await fetch(`/api/employee-tasks/${taskId}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", status: "IN_PROGRESS" }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "That task could not be started.");
      return;
    }

    startTransition(() => router.refresh());
  }

  async function addComment(body: string) {
    if (!openId) return;

    setBusy(true);
    setError(null);

    const response = await fetch(`/api/employee-tasks/${openId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    const data = (await response.json().catch(() => null)) as
      | { error?: string; comment?: TaskComment }
      | null;

    setBusy(false);

    if (!response.ok || !data?.comment) {
      setError(data?.error ?? "That comment didn't save.");
      return;
    }

    const added = data.comment;
    setThread((current) =>
      current && current.taskId === openId
        ? { ...current, comments: [...current.comments, added] }
        : current,
    );
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      {/* Page header. The role comes from the session, never a literal. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-sky-600">
            {identity.eyebrow}
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-950">
            {identity.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{identity.subtitle}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setExportOpen((current) => !current)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            {exportOpen ? (
              <div
                ref={exportRef}
                className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
              >
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    downloadCsv(buildTaskCsv(filtered), taskCsvFilename("filtered"));
                    setExportOpen(false);
                  }}
                >
                  <span className="block font-semibold text-slate-900">
                    Export filtered tasks
                  </span>
                  {filtered.length} row{filtered.length === 1 ? "" : "s"} matching what is on
                  screen
                </button>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setExportOpen(false);
                    void exportCompleted();
                  }}
                >
                  <span className="block font-semibold text-slate-900">
                    Export all completed tasks
                  </span>
                  Everything approved or done that you can see
                </button>
              </div>
            ) : null}
          </div>

          <Button size="sm" onClick={jumpToTable}>
            View All Assigned Tasks
          </Button>
        </div>
      </div>

      {/*
        The overview. Derived on the server from the same rows the table below
        filters, so a card can never disagree with the list it sits above.
      */}
      <MyWorkOverview
        view={overview}
        activity={recentActivity}
        now={now}
        // The detail opens as a modal over the page, so there is nowhere to
        // scroll to - it comes to the reader wherever they clicked from.
        onOpenTask={open}
        onFocusToday={() => {
          // Focus mode is the existing filter, not a second page.
          update("todayOnly", !filters.todayOnly);
          jumpToTable();
        }}
        focusActive={filters.todayOnly}
      />

      {/* The detailed management area: everything, with every filter on it. */}
      <div ref={tableRef} className="scroll-mt-6 pt-2">
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">{heading}</h2>
        <p className="mt-0.5 text-sm text-slate-600">
          {`${summary.active} active, ${summary.dueSoon} due soon, ${summary.overdue} overdue, ${summary.needsReview} needs review`}
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-10 pl-9 text-sm"
              placeholder="Search tasks…"
              value={filters.search}
              onChange={(event) => update("search", event.target.value)}
              aria-label="Search tasks"
            />
          </div>

          <Button
            size="sm"
            variant="secondary"
            className="lg:hidden"
            onClick={() => setShowFilters((open) => !open)}
          >
            <ListFilter className="mr-1.5 h-3.5 w-3.5" />
            Filters
          </Button>

          <div
            className={`${showFilters ? "grid" : "hidden"} w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-1 lg:flex-wrap lg:items-center`}
          >
            <label className="min-w-[9rem] flex-1">
              <span className="sr-only">Due date range</span>
              <Select
                className="h-10 text-sm"
                value={filters.datePreset}
                onChange={(event) => update("datePreset", event.target.value as DatePreset)}
              >
                {DATE_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </Select>
            </label>

            {filters.datePreset === "custom" ? (
              <>
                <Input
                  type="date"
                  className="h-10 flex-1 text-sm"
                  value={filters.customFrom}
                  onChange={(event) => update("customFrom", event.target.value)}
                  aria-label="Due from"
                />
                <Input
                  type="date"
                  className="h-10 flex-1 text-sm"
                  value={filters.customTo}
                  onChange={(event) => update("customTo", event.target.value)}
                  aria-label="Due to"
                />
              </>
            ) : null}

            <Select
              className="h-10 min-w-[9rem] flex-1 text-sm"
              value={filters.status}
              onChange={(event) => update("status", event.target.value)}
              aria-label="Status"
            >
              <option value="">All Statuses</option>
              {FILTER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status as never)}
                </option>
              ))}
            </Select>

            <Select
              className="h-10 min-w-[9rem] flex-1 text-sm"
              value={filters.priority}
              onChange={(event) => update("priority", event.target.value)}
              aria-label="Priority"
            >
              <option value="">All Priorities</option>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            <Select
              className="h-10 min-w-[9rem] flex-1 text-sm"
              value={filters.category}
              onChange={(event) => update("category", event.target.value)}
              aria-label="Category"
            >
              <option value="">All Categories</option>
              {CATEGORY_GUIDES.map((guide) => (
                <option key={guide.value} value={guide.value}>
                  {guide.label}
                </option>
              ))}
            </Select>

            <Select
              className="h-10 min-w-[9rem] flex-1 text-sm"
              value={filters.clientId}
              onChange={(event) => update("clientId", event.target.value)}
              aria-label="Client"
            >
              <option value="">All Clients</option>
              <option value="internal">Internal Tasks</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </Select>

            <Select
              className="h-10 min-w-[10rem] flex-1 text-sm"
              value={filters.sort}
              onChange={(event) => update("sort", event.target.value as SortKey)}
              aria-label="Sort by"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          {hasActiveFilters(filters) ? (
            <Button size="sm" variant="ghost" onClick={() => {
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear Filters
            </Button>
          ) : null}
        </div>

        {/* Tabs */}
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
          {TASK_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => update("tab", tab.value as TaskTab)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                filters.tab === tab.value
                  ? "bg-slate-950 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 rounded-md px-1.5 py-0.5 text-[11px] ${
                  filters.tab === tab.value ? "bg-white/20" : "bg-slate-100"
                }`}
              >
                {tabCounts[tab.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {capped ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Showing the first 500 tasks. Narrow the filters to be sure you are seeing
          everything.
        </p>
      ) : null}

      {/* The list, full width. The detail opens over it rather than beside it. */}
      <div className="grid gap-4">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,2fr)_6rem_8rem_9rem_2.5rem] gap-3 border-b border-slate-100 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 lg:grid">
            <span>Task</span>
            <span>Client / Campaign</span>
            <span>Priority</span>
            <span>Due Date</span>
            <span>Status</span>
            <span />
          </div>

          {visible.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-slate-900">Nothing here.</p>
              <p className="mt-1 text-sm text-slate-600">
                {hasActiveFilters(filters)
                  ? "No task matches those filters."
                  : "No tasks assigned to you yet."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((task) => {
                const due = relativeDue(task.dueDate, now);
                const guide = categoryGuide(task.category as never);
                const isOpen = openId === task.id;

                return (
                  <li
                    key={task.id}
                    className={`relative transition ${
                      isOpen ? "bg-sky-50/60" : "hover:bg-slate-50/70"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => open(isOpen ? null : task.id)}
                      className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_6rem_8rem_9rem_2.5rem] lg:items-center lg:gap-3"
                    >
                      <span
                        className={`absolute inset-y-0 left-0 w-0.5 ${
                          isOpen ? "bg-sky-500" : "bg-transparent"
                        }`}
                      />

                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {task.title}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone="slate" className="px-2 py-0.5 text-[10px] font-medium">
                            {guide?.label ?? formatEnumLabel(task.category)}
                          </Badge>
                          {task.client ? null : (
                            <Badge
                              tone="slate"
                              className="px-2 py-0.5 text-[10px] font-medium"
                            >
                              Internal task
                            </Badge>
                          )}
                          {task.commentCount > 0 ? (
                            <span className="text-[10px] text-slate-400">
                              {task.commentCount} comment{task.commentCount === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-slate-500">
                          Assigned by {task.createdBy?.name ?? "the system"}
                        </span>
                      </span>

                      <span className="min-w-0 text-sm">
                        <span className="block truncate text-slate-800">
                          {task.client?.companyName ?? "Internal task"}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {task.project?.name ?? "No campaign"}
                        </span>
                      </span>

                      <span>
                        <Badge tone={priorityTone(task.priority)}>
                          {formatEnumLabel(task.priority)}
                        </Badge>
                      </span>

                      <span className="text-sm">
                        <span className="block text-slate-800">
                          {new Date(task.dueDate).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span
                          className={`block text-xs ${
                            due.tone === "overdue"
                              ? "font-medium text-rose-600"
                              : due.tone === "today" || due.tone === "soon"
                                ? "text-amber-600"
                                : "text-slate-500"
                          }`}
                        >
                          {due.label}
                        </span>
                      </span>

                      <span>
                        <Badge tone={statusTone(task.status)}>{statusLabel(task.status)}</Badge>
                      </span>

                      <span />
                    </button>

                    {/* Quick actions, outside the row button so it is not a nested button. */}
                    <div className="absolute right-3 top-3 lg:top-1/2 lg:-translate-y-1/2">
                      <RowMenu
                        label={`Actions for ${task.title}`}
                        items={[
                          { label: "View details", onSelect: () => open(task.id) },
                          ...(task.assignedTo?.id === viewer.id
                          && task.status === "TODO"
                          && !task.archivedAt
                            ? [
                                {
                                  label: "Start task",
                                  onSelect: () => void startTask(task.id),
                                },
                              ]
                            : []),
                          ...(task.client
                            ? [{ label: "Open client", href: `/clients/${task.client.id}` }]
                            : []),
                        ]}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pagination */}
          {filtered.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-600">
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} tasks
              </p>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous
                  </Button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1)
                    .filter(
                      (number) =>
                        number === 1
                        || number === totalPages
                        || Math.abs(number - currentPage) <= 1,
                    )
                    .map((number, index, list) => (
                      <span key={number} className="flex items-center gap-1">
                        {index > 0 && number - list[index - 1] > 1 ? (
                          <span className="px-1 text-xs text-slate-400">…</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setPage(number)}
                          className={`h-9 min-w-9 rounded-xl px-2.5 text-xs font-semibold transition ${
                            number === currentPage
                              ? "bg-slate-950 text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          {number}
                        </button>
                      </span>
                    ))}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={currentPage === totalPages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next
                  </Button>
                </div>

                <Select
                  className="h-9 w-auto text-xs"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  aria-label="Rows per page"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} per page
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : null}
        </div>

        {openTask ? (
          <TaskDetailModal
            task={openTask}
            viewer={viewer}
            comments={comments}
            activity={activity}
            loading={threadLoading}
            busy={busy}
            error={error}
            onClose={() => open(null)}
            onAction={runAction}
            onComment={addComment}
          />
        ) : null}
      </div>
    </div>
  );
}
