"use client";

import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  LoaderCircle,
  NotebookPen,
  Search,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  complianceFor,
  latestEntry,
  needsAttention,
  sameDay,
  summariseMembers,
  summariseWeek,
  tasksRequiringEod,
  type WeekEod,
  type WeekTask,
} from "@/lib/eod/weekly-view";
import { compileWeek, reportProgress } from "@/lib/eod/weekly-compile";
import { statusLabel, statusTone } from "@/lib/tasks/task-catalogue";
import { formatEnumLabel } from "@/lib/utils";

const TONES = {
  sky: "bg-sky-50 text-sky-600",
  indigo: "bg-indigo-50 text-indigo-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
  slate: "bg-slate-100 text-slate-600",
} as const;

type Tone = keyof typeof TONES;

export interface WeeklyReportRow {
  id: string;
  userId: string;
  status: string;
  summary: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  managerNote: string | null;
  approvedByName: string | null;
  userName: string;
  userRole: string | null;
}

const REPORT_TONES: Record<string, Tone> = {
  NOT_STARTED: "slate",
  DRAFT: "sky",
  SUBMITTED: "indigo",
  NEEDS_CHANGES: "rose",
  APPROVED: "emerald",
};

const MEMBER_STATE_TONES: Record<string, Tone> = {
  "EOD Complete": "emerald",
  "Needs Attention": "amber",
  "Missing EOD": "rose",
  "Has Blocker": "amber",
  "Nothing Due": "slate",
};

function dayLabel(value: string | Date) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function timeLabel(value: string | Date) {
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function Card({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  tone: Tone;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-start gap-2.5">
        <span className={`rounded-xl p-2 ${TONES[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-600">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold leading-7 text-slate-950">{value}</p>
          <p className="text-[11px] leading-4 text-slate-500">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 p-4">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * The manager's week.
 *
 * Two questions, kept apart because confusing them sends somebody to chase the
 * wrong person: how many entries are in against how many are owed, and how many
 * people are done against how many owe anything. Fourteen of seventeen is not
 * five of six.
 *
 * The week's data arrives from the server; everything below - filtering,
 * selecting a person, switching tabs - runs here, so scanning the team does not
 * cost a round trip each time.
 */
export function WeeklyWorkBoard({
  weekStart,
  tasks,
  entries,
  members,
  reports,
  recentActivity,
  viewerId,
  canReview,
  deadline,
  today,
}: {
  weekStart: string;
  tasks: WeekTask[];
  entries: WeekEod[];
  members: { id: string; name: string; teamRole: string | null }[];
  reports: WeeklyReportRow[];
  recentActivity: {
    id: string;
    authorName: string;
    taskId: string;
    taskTitle: string;
    updatedAt: string;
    revised: boolean;
  }[];
  viewerId: string;
  canReview: boolean;
  deadline: string;
  today: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tab, setTab] = useState<"eod" | "reports">("eod");
  const [selectedMember, setSelectedMember] = useState<string | null>(
    members[0]?.id ?? null,
  );
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [eodFilter, setEodFilter] = useState("");
  const [busyReport, setBusyReport] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const day = useMemo(() => new Date(today), [today]);
  const week = useMemo(() => new Date(weekStart), [weekStart]);

  const memberSummaries = useMemo(
    () => summariseMembers(tasks, entries, members, day),
    [tasks, entries, members, day],
  );

  const compliance = useMemo(() => complianceFor(memberSummaries), [memberSummaries]);
  const summary = useMemo(
    () => summariseWeek(tasks, memberSummaries, week),
    [tasks, memberSummaries, week],
  );
  const attention = useMemo(
    () => needsAttention(tasks, entries, day),
    [tasks, entries, day],
  );

  const progress = useMemo(
    () => reportProgress(reports as never, members.length),
    [reports, members.length],
  );

  const clients = useMemo(() => {
    const seen = new Map<string, string>();
    for (const task of tasks) {
      if (task.client) seen.set(task.client.id, task.client.companyName);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [tasks]);

  const required = useMemo(() => tasksRequiringEod(tasks, day), [tasks, day]);
  const requiredIds = useMemo(() => new Set(required.map((task) => task.id)), [required]);

  /** The task rows for the selected person, after the filter row. */
  const memberTasks = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return tasks.filter((task) => {
      if (selectedMember && task.assignedTo?.id !== selectedMember) return false;
      if (memberFilter && task.assignedTo?.id !== memberFilter) return false;
      if (clientFilter) {
        const key = task.client?.id ?? "internal";
        if (key !== clientFilter) return false;
      }
      if (statusFilter && task.status !== statusFilter) return false;

      if (eodFilter) {
        const mine = entries.filter((entry) => entry.taskId === task.id);
        const todays = mine.filter((entry) => sameDay(entry.entryDate, day));

        if (eodFilter === "submitted" && todays.length === 0) return false;
        if (eodFilter === "missing" && (todays.length > 0 || !requiredIds.has(task.id))) {
          return false;
        }
        if (eodFilter === "blocker" && !mine.some((entry) => entry.blockers?.trim())) {
          return false;
        }
        if (eodFilter === "silent" && mine.length > 0) return false;
      }

      if (needle) {
        const haystack = [
          task.title,
          task.client?.companyName ?? "Internal",
          task.assignedTo?.name,
          task.blocker,
          ...entries
            .filter((entry) => entry.taskId === task.id)
            .flatMap((entry) => [entry.summary, entry.nextSteps, entry.blockers]),
          ...reports.map((report) => report.summary),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!needle.split(/\s+/).every((word) => haystack.includes(word))) return false;
      }

      return true;
    });
  }, [
    tasks,
    entries,
    reports,
    selectedMember,
    memberFilter,
    clientFilter,
    statusFilter,
    eodFilter,
    search,
    day,
    requiredIds,
  ]);

  const selected = memberSummaries.find((member) => member.userId === selectedMember);

  function shiftWeek(days: number) {
    const next = new Date(week);
    next.setDate(next.getDate() + days);
    router.push(`/fulfillment?week=${next.toISOString().slice(0, 10)}`);
  }

  async function review(reportId: string, decision: "APPROVE" | "REQUEST_CHANGES") {
    setBusyReport(reportId);
    setError(null);

    const response = await fetch("/api/weekly-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review", reportId, decision, note: note.trim() || null }),
    });

    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    setBusyReport(null);

    if (!response.ok) {
      setError(data?.error ?? "That didn't go through.");
      return;
    }

    setNoteFor(null);
    setNote("");
    startTransition(() => router.refresh());
  }

  const weekEndLabel = new Date(week);
  weekEndLabel.setDate(weekEndLabel.getDate() + 6);

  return (
    <div className="space-y-4">
      {/* Header and week selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Weekly Work</h1>
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-800">
              {dayLabel(week)} – {dayLabel(weekEndLabel)}, {weekEndLabel.getFullYear()}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="Previous week"
              onClick={() => shiftWeek(-7)}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next week"
              onClick={() => shiftWeek(7)}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 transition hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Link
          href="/work?focus=today"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Clock className="h-4 w-4" />
          My Tasks Today
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Card
          label="Total Tasks"
          value={String(summary.totalTasks)}
          hint="This week"
          icon={ClipboardList}
          tone="indigo"
        />
        <Card
          label="Completed"
          value={String(summary.completed)}
          hint={
            summary.totalTasks
              ? `${Math.round((summary.completed / summary.totalTasks) * 100)}% of total`
              : "Nothing yet"
          }
          icon={CheckCircle2}
          tone="emerald"
        />
        <Card
          label="EOD Submitted Today"
          value={`${compliance.tasksSubmitted} / ${compliance.tasksRequired}`}
          hint={`${compliance.taskPercent}% completion`}
          icon={NotebookPen}
          tone="violet"
        />
        <Card
          label="Missing EOD"
          value={String(summary.missingToday)}
          hint="Tasks need updates"
          icon={Clock}
          tone="amber"
        />
        <Card
          label="Blocked Tasks"
          value={String(summary.blocked)}
          hint="Awaiting resolution"
          icon={TriangleAlert}
          tone="rose"
        />
        <Card
          label="Weekly Reports"
          value={`${progress.submitted + progress.approved} / ${progress.expected}`}
          hint="Submitted"
          icon={FileText}
          tone="sky"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-10 pl-9 text-sm"
            placeholder="Search tasks, people, or clients…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search the week"
          />
        </div>

        <Select
          className="h-10 min-w-[9rem] flex-1 text-sm"
          value={memberFilter}
          onChange={(event) => setMemberFilter(event.target.value)}
          aria-label="Team member"
        >
          <option value="">All members</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>

        <Select
          className="h-10 min-w-[9rem] flex-1 text-sm"
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          aria-label="Client"
        >
          <option value="">All clients</option>
          <option value="internal">Internal tasks</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>

        <Select
          className="h-10 min-w-[9rem] flex-1 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Task status"
        >
          <option value="">All statuses</option>
          {["IN_PROGRESS", "WAITING_CLIENT", "BLOCKED", "NEEDS_REVIEW", "REVISION_REQUIRED", "TODO"].map(
            (status) => (
              <option key={status} value={status}>
                {statusLabel(status as never)}
              </option>
            ),
          )}
        </Select>

        <Select
          className="h-10 min-w-[10rem] flex-1 text-sm"
          value={eodFilter}
          onChange={(event) => setEodFilter(event.target.value)}
          aria-label="EOD status"
        >
          <option value="">All EOD status</option>
          <option value="submitted">Submitted today</option>
          <option value="missing">Missing today</option>
          <option value="blocker">Has blocker</option>
          <option value="silent">No update this week</option>
        </Select>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setSearch("");
            setMemberFilter("");
            setClientFilter("");
            setStatusFilter("");
            setEodFilter("");
          }}
        >
          Clear
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,2.6fr)_minmax(17rem,1fr)]">
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 rounded-2xl border border-slate-200 bg-white p-1">
            {(
              [
                { value: "eod", label: "Team EODs" },
                { value: "reports", label: "Weekly Reports" },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setTab(item.value)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  tab === item.value
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "eod" ? (
            <>
              <Panel
                title="Team Members Overview"
                subtitle="EOD submission status at a glance."
              >
                {memberSummaries.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-500">
                    Nobody is set up to report this week.
                  </p>
                ) : (
                  <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-4">
                    {memberSummaries.map((member) => (
                      <button
                        key={member.userId}
                        type="button"
                        onClick={() => setSelectedMember(member.userId)}
                        className={`rounded-xl border p-3 text-left transition ${
                          selectedMember === member.userId
                            ? "border-sky-400 bg-sky-50/40"
                            : "border-slate-200 hover:bg-slate-50/70"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                            {initials(member.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {member.name}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">
                              {member.teamRole ? formatEnumLabel(member.teamRole) : "—"}
                            </p>
                          </div>
                        </div>

                        <dl className="mt-3 grid grid-cols-4 gap-1 text-center">
                          {[
                            { value: member.activeTasks, label: "Active" },
                            { value: member.submittedToday, label: "Filed" },
                            { value: member.missingToday, label: "Missing" },
                            { value: member.blockedTasks, label: "Blocked" },
                          ].map((cell) => (
                            <div key={cell.label}>
                              <dd className="text-base font-semibold text-slate-900">
                                {cell.value}
                              </dd>
                              <dt className="text-[10px] leading-3 text-slate-500">
                                {cell.label}
                              </dt>
                            </div>
                          ))}
                        </dl>

                        <span
                          className={`mt-2.5 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[MEMBER_STATE_TONES[member.state]]}`}
                        >
                          {member.state}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Panel>

              {selected ? (
                <Panel
                  title={`${selected.name} — ${selected.teamRole ? formatEnumLabel(selected.teamRole) : "Team"}`}
                  subtitle={`${memberTasks.length} task${memberTasks.length === 1 ? "" : "s"} matching the filters.`}
                >
                  {memberTasks.length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-500">
                      Nothing here for this person under those filters.
                    </p>
                  ) : (
                    <div className="hidden md:block">
                      {/*
                        Nine columns need a real floor, not a hopeful one. At
                        52rem the browser was squeezing the last column until
                        "View EOD" wrapped onto two lines; the widths below are
                        declared once here so no cell has to fight for room.
                        Narrower than this and the container scrolls, which is
                        the right answer on a phone - the page itself never does.
                      */}
                      {/*
                        Was a 64rem floor inside a scroller, which no normal
                        desktop could satisfy once the sidebar was accounted
                        for. Fixed layout and percentage columns fit the card
                        instead, and the three lowest-priority columns drop out
                        below xl rather than forcing the row sideways.
                      */}
                      <table className="w-full table-fixed text-left text-xs">
                        <colgroup>
                          <col className="w-[24%]" />
                          <col className="w-[16%]" />
                          <col className="w-[12%]" />
                          <col className="hidden w-[11%] 2xl:table-column" />
                          <col className="w-[10%]" />
                          <col className="w-[13%]" />
                          <col className="hidden w-[6%] 2xl:table-column" />
                          <col className="hidden w-[14%] 22xl:table-column" />
                          <col className="w-[5.5rem]" />
                        </colgroup>
                        <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">Task</th>
                            <th className="px-3 py-2.5 font-semibold">Client</th>
                            <th className="px-3 py-2.5 font-semibold">Status</th>
                            <th className="hidden px-3 py-2.5 font-semibold 2xl:table-cell">Progress</th>
                            <th className="px-3 py-2.5 font-semibold">Due</th>
                            <th className="px-3 py-2.5 font-semibold">EOD today</th>
                            <th className="hidden px-3 py-2.5 font-semibold 2xl:table-cell">Time</th>
                            <th className="hidden px-3 py-2.5 font-semibold 22xl:table-cell">Blocker</th>
                            <th className="px-3 py-2.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {memberTasks.map((task) => {
                            const latest = latestEntry(entries, task.id, selected.userId);
                            const todays = entries.find(
                              (entry) =>
                                entry.taskId === task.id
                                && entry.authorId === selected.userId
                                && sameDay(entry.entryDate, day),
                            );
                            const needed = requiredIds.has(task.id);

                            return (
                              <tr key={task.id} className="align-top hover:bg-slate-50/60">
                                <td className="px-4 py-3">
                                  <p className="break-words font-medium text-slate-900">
                                    {task.title}
                                  </p>
                                </td>
                                <td className="px-3 py-3 text-slate-600">
                                  <span className="block truncate" title={task.client?.companyName}>
                                    {task.client?.companyName ?? "Internal"}
                                  </span>
                                </td>
                                <td className="px-3 py-3">
                                  <Badge
                                    tone={statusTone(task.status)}
                                    className="whitespace-nowrap"
                                  >
                                    {statusLabel(task.status)}
                                  </Badge>
                                </td>
                                <td className="hidden px-3 py-3 2xl:table-cell">
                                  {latest?.progressPercent !== null
                                  && latest?.progressPercent !== undefined ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
                                        <span
                                          className="block h-full rounded-full bg-sky-500"
                                          style={{ width: `${latest.progressPercent}%` }}
                                        />
                                      </span>
                                      <span className="text-slate-700">
                                        {latest.progressPercent}%
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                                  {dayLabel(task.dueDate)}
                                </td>
                                <td className="px-3 py-3">
                                  {todays ? (
                                    <div>
                                      <Badge tone="emerald" className="whitespace-nowrap">
                                        Submitted
                                      </Badge>
                                      <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-500">
                                        {timeLabel(todays.updatedAt)}
                                      </p>
                                    </div>
                                  ) : needed ? (
                                    <Badge tone="rose" className="whitespace-nowrap">
                                      Missing
                                    </Badge>
                                  ) : (
                                    <span className="whitespace-nowrap text-slate-400">
                                      Not due
                                    </span>
                                  )}
                                </td>
                                <td className="hidden whitespace-nowrap px-3 py-3 text-slate-600 2xl:table-cell">
                                  {todays?.hoursSpent ? `${todays.hoursSpent}h` : "—"}
                                </td>
                                <td className="hidden px-3 py-3 text-slate-600 22xl:table-cell">
                                  {/*
                                    Clamped to two lines with the full text on
                                    hover. A long blocker used to stretch this
                                    cell and starve every column after it.
                                  */}
                                  {(() => {
                                    const blocker =
                                      latest?.blockers?.trim() || task.blocker?.trim() || null;

                                    return blocker ? (
                                      <span
                                        className="line-clamp-2 break-words"
                                        title={blocker}
                                      >
                                        {blocker}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    );
                                  })()}
                                </td>
                                <td className="px-3 py-3">
                                  <Link
                                    href={`/work?task=${task.id}`}
                                    className="inline-block whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200"
                                  >
                                    {todays ? "View EOD" : "Open"}
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/*
                    The same rows as cards on a phone. Nine columns cannot be
                    read on a 375px screen whatever the widths are, and making
                    somebody scroll a table sideways to reach the action is
                    worse than stacking it.
                  */}
                  {memberTasks.length ? (
                    <ul className="divide-y divide-slate-100 md:hidden">
                      {memberTasks.map((task) => {
                        const latest = latestEntry(entries, task.id, selected.userId);
                        const todays = entries.find(
                          (entry) =>
                            entry.taskId === task.id
                            && entry.authorId === selected.userId
                            && sameDay(entry.entryDate, day),
                        );
                        const needed = requiredIds.has(task.id);
                        const blocker =
                          latest?.blockers?.trim() || task.blocker?.trim() || null;

                        return (
                          <li key={task.id} className="space-y-2 p-4">
                            <div>
                              <p className="break-words text-sm font-medium text-slate-900">
                                {task.title}
                              </p>
                              <p className="text-xs text-slate-500">
                                {task.client?.companyName ?? "Internal"} · due{" "}
                                {dayLabel(task.dueDate)}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge tone={statusTone(task.status)} className="whitespace-nowrap">
                                {statusLabel(task.status)}
                              </Badge>
                              {todays ? (
                                <Badge tone="emerald" className="whitespace-nowrap">
                                  EOD {timeLabel(todays.updatedAt)}
                                </Badge>
                              ) : needed ? (
                                <Badge tone="rose" className="whitespace-nowrap">
                                  Missing EOD
                                </Badge>
                              ) : null}
                              {latest?.progressPercent !== null
                              && latest?.progressPercent !== undefined ? (
                                <Badge tone="sky">{latest.progressPercent}%</Badge>
                              ) : null}
                              {todays?.hoursSpent ? (
                                <Badge tone="slate">{todays.hoursSpent}h</Badge>
                              ) : null}
                            </div>

                            {blocker ? (
                              <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs leading-5 text-rose-700">
                                {blocker}
                              </p>
                            ) : null}

                            <Link
                              href={`/work?task=${task.id}`}
                              className="block rounded-lg bg-slate-100 py-2 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                            >
                              {todays ? "View EOD" : "Open task"}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </Panel>
              ) : null}

              <Panel title="Recent EOD Activity" subtitle="Latest entries from the team.">
                {recentActivity.length === 0 ? (
                  <p className="p-6 text-center text-xs text-slate-500">
                    No entries have been written yet.
                  </p>
                ) : (
                  <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4 md:grid-cols-2 2xl:grid-cols-4">
                    {recentActivity.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                      >
                        <span className={`rounded-lg p-1.5 ${TONES.emerald}`}>
                          <NotebookPen className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs leading-5 text-slate-800">
                            {item.authorName} {item.revised ? "updated" : "submitted"} EOD for{" "}
                            {item.taskTitle}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {timeLabel(item.updatedAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          ) : (
            <WeeklyReportsTab
              reports={reports}
              members={members}
              tasks={tasks}
              entries={entries}
              weekStart={week}
              requiredCount={required.length * 5}
              viewerId={viewerId}
              canReview={canReview}
              busyReport={busyReport}
              noteFor={noteFor}
              note={note}
              error={error}
              onNoteFor={setNoteFor}
              onNote={setNote}
              onReview={review}
            />
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Panel title="Today's EOD Compliance">
            <div className="space-y-3 p-4">
              <div>
                <p className="text-2xl font-semibold text-slate-950">
                  {compliance.tasksSubmitted} / {compliance.tasksRequired}
                </p>
                <p className="text-xs text-slate-500">Task entries filed today</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${compliance.taskPercent}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-emerald-700">
                  {compliance.taskPercent}% complete
                </p>
              </div>

              {/*
                The second figure, kept visibly separate. People and entries are
                different denominators and reading one as the other sends a
                manager to the wrong person.
              */}
              <div className="border-t border-slate-100 pt-3">
                <p className="text-sm font-semibold text-slate-900">
                  {compliance.membersComplete} / {compliance.membersExpected}
                </p>
                <p className="text-xs text-slate-500">Team members fully up to date</p>
              </div>
            </div>
          </Panel>

          <Panel title="Needs Attention" subtitle="Reporting gaps and blockers.">
            {attention.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                Everything is accounted for today.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attention.map((row) => (
                  <li key={row.id} className="flex items-start gap-2.5 p-3">
                    <span
                      className={`rounded-lg p-1.5 ${row.kind === "blocked" ? TONES.rose : TONES.amber}`}
                    >
                      {row.kind === "blocked" ? (
                        <AlertCircle className="h-3.5 w-3.5" />
                      ) : (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-900">{row.title}</p>
                      <p className="text-[11px] text-slate-500">{row.personName}</p>
                      <p className="truncate text-[11px] text-slate-500">{row.detail}</p>
                    </div>
                    <Link
                      href={`/work?task=${row.taskId}`}
                      className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200"
                    >
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Weekly Report Progress">
            <div className="space-y-2 p-4">
              <p className="text-2xl font-semibold text-slate-950">
                {progress.submitted + progress.approved} / {progress.expected}
              </p>
              <p className="text-xs text-slate-500">
                {progress.expected
                  ? Math.round(
                      ((progress.submitted + progress.approved) / progress.expected) * 100,
                    )
                  : 0}
                % filed
              </p>

              <dl className="space-y-1 border-t border-slate-100 pt-2 text-xs">
                {[
                  { label: "Approved", value: progress.approved, tone: "emerald" as Tone },
                  { label: "Submitted", value: progress.submitted, tone: "indigo" as Tone },
                  { label: "Draft", value: progress.draft, tone: "sky" as Tone },
                  { label: "Needs changes", value: progress.needsChanges, tone: "rose" as Tone },
                  { label: "Not started", value: Math.max(0, progress.notStarted), tone: "slate" as Tone },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <dt className="flex items-center gap-2 text-slate-600">
                      <span className={`h-2 w-2 rounded-full ${TONES[row.tone]}`} />
                      {row.label}
                    </dt>
                    <dd className="font-semibold text-slate-900">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Panel>

          <Panel title="Reporting Deadline">
            <div className="p-4">
              <p className="text-xs text-slate-500">Weekly reports due by</p>
              <p className="mt-1 text-sm font-semibold text-sky-700">
                {new Date(deadline).toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <p className="text-sm font-semibold text-sky-700">
                {timeLabel(deadline)}
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/**
 * The weekly reports tab.
 *
 * Each row shows the week compiled from that person's entries, so nobody has to
 * read a summary somebody retyped from their own notes.
 */
function WeeklyReportsTab({
  reports,
  members,
  tasks,
  entries,
  weekStart,
  requiredCount,
  viewerId,
  canReview,
  busyReport,
  noteFor,
  note,
  error,
  onNoteFor,
  onNote,
  onReview,
}: {
  reports: WeeklyReportRow[];
  members: { id: string; name: string; teamRole: string | null }[];
  tasks: WeekTask[];
  entries: WeekEod[];
  weekStart: Date;
  requiredCount: number;
  viewerId: string;
  canReview: boolean;
  busyReport: string | null;
  noteFor: string | null;
  note: string;
  error: string | null;
  onNoteFor: (id: string | null) => void;
  onNote: (value: string) => void;
  onReview: (reportId: string, decision: "APPROVE" | "REQUEST_CHANGES") => void;
}) {
  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}

      {members.map((member) => {
        const report = reports.find((row) => row.userId === member.id);
        const status = report?.status ?? "NOT_STARTED";

        const mine = entries.filter((entry) => entry.authorId === member.id);
        const compiled = compileWeek(
          tasks.filter((task) => task.assignedTo?.id === member.id),
          mine,
          weekStart,
          requiredCount,
        );

        return (
          <Panel
            key={member.id}
            title={member.name}
            subtitle={member.teamRole ? formatEnumLabel(member.teamRole) : undefined}
          >
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONES[REPORT_TONES[status] ?? "slate"]}`}
                >
                  {formatEnumLabel(status)}
                </span>
                {report?.submittedAt ? (
                  <span className="text-[11px] text-slate-500">
                    Submitted {dayLabel(report.submittedAt)}
                  </span>
                ) : null}
                {report?.approvedByName ? (
                  <span className="text-[11px] text-emerald-700">
                    Approved by {report.approvedByName}
                  </span>
                ) : null}
              </div>

              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { label: "Tasks worked on", value: compiled.tasksWorkedOn },
                  { label: "Completed", value: compiled.completed.length },
                  { label: "In progress", value: compiled.inProgress.length },
                  { label: "Blocked", value: compiled.blocked.length },
                  { label: "Hours logged", value: `${compiled.totalHours}h` },
                ].map((cell) => (
                  <div key={cell.label} className="rounded-xl border border-slate-100 p-2.5">
                    <dd className="text-lg font-semibold text-slate-950">{cell.value}</dd>
                    <dt className="text-[11px] text-slate-500">{cell.label}</dt>
                  </div>
                ))}
              </dl>

              {compiled.tasksWorkedOn === 0 ? (
                <p className="text-xs text-slate-500">
                  No entries this week, so there is nothing to compile yet.
                </p>
              ) : (
                <div className="space-y-2 text-xs">
                  {[
                    { label: "Completed this week", rows: compiled.completed },
                    { label: "Still in progress", rows: compiled.inProgress },
                    { label: "Blocked", rows: compiled.blocked },
                  ]
                    .filter((section) => section.rows.length > 0)
                    .map((section) => (
                      <div key={section.label}>
                        <p className="font-semibold text-slate-900">{section.label}</p>
                        <ul className="mt-1 space-y-1">
                          {section.rows.map((row) => (
                            <li key={row.taskId} className="text-slate-600">
                              <span className="font-medium text-slate-800">{row.title}</span>
                              {" — "}
                              {row.clientName}
                              {row.progressPercent !== null ? ` · ${row.progressPercent}%` : ""}
                              {row.hoursSpent ? ` · ${row.hoursSpent}h` : ""}
                              <span className="block text-slate-500">{row.latestUpdate}</span>
                              {row.blocker ? (
                                <span className="block text-rose-600">
                                  Blocker: {row.blocker}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              )}

              {report?.summary ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <p className="text-xs font-semibold text-slate-900">Their summary</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                    {report.summary}
                  </p>
                </div>
              ) : null}

              {report?.managerNote ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900">Manager note</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">{report.managerNote}</p>
                </div>
              ) : null}

              {/*
                Only offered on somebody else's submitted week. A person cannot
                sign off their own, and the service refuses it too.
              */}
              {canReview && report && status === "SUBMITTED" && report.userId !== viewerId ? (
                noteFor === report.id ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      value={note}
                      onChange={(event) => onNote(event.target.value)}
                      placeholder="What needs correcting?"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => onNoteFor(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyReport === report.id || !note.trim()}
                        onClick={() => onReview(report.id, "REQUEST_CHANGES")}
                      >
                        Send back
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busyReport === report.id}
                      onClick={() => onReview(report.id, "APPROVE")}
                    >
                      {busyReport === report.id ? (
                        <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Approve
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onNoteFor(report.id)}>
                      Request changes
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
