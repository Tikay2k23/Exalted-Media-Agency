"use client";

import {
  Activity,
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Eye,
  Hourglass,
  MessageSquare,
  Target,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  categoryGuide,
  priorityTone,
  statusLabel,
  statusTone,
} from "@/lib/tasks/task-catalogue";
import { relativeDue } from "@/lib/tasks/task-filters";
import type { AttentionItem, MyWorkView } from "@/lib/tasks/my-work-view";
import { formatEnumLabel } from "@/lib/utils";

import type { TaskEvent } from "./task-types";

function shortDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** "2 hours ago", "yesterday" - how long since, in the words people use. */
function timeAgo(value: string, now: Date) {
  const then = new Date(value).getTime();
  const minutes = Math.round((now.getTime() - then) / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;

  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Target;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="flex items-start gap-2.5">
          <span className="rounded-xl bg-slate-100 p-2 text-slate-600">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-6 text-center text-xs text-slate-500">{children}</p>;
}

const ATTENTION_ICONS: Record<AttentionItem["kind"], typeof Target> = {
  revision: MessageSquare,
  review: Eye,
  overdue: TriangleAlert,
  "due-today": CalendarCheck,
  blocked: AlertCircle,
};

const ATTENTION_TONES: Record<AttentionItem["kind"], string> = {
  revision: "bg-violet-50 text-violet-600",
  review: "bg-sky-50 text-sky-600",
  overdue: "bg-rose-50 text-rose-600",
  "due-today": "bg-amber-50 text-amber-600",
  blocked: "bg-slate-100 text-slate-600",
};

/**
 * The daily overview above the task list.
 *
 * Six panels, six different questions. What should I do first, what cannot
 * move, what needs a decision from me, which accounts am I carrying, how is the
 * week going, and what just happened. Nothing here repeats the list below: that
 * one answers "show me everything", which is a different question from all of
 * these.
 */
export function MyWorkOverview({
  view,
  activity,
  now,
  onOpenTask,
  onFocusToday,
  focusActive,
}: {
  view: MyWorkView;
  activity: TaskEvent[];
  now: Date;
  onOpenTask: (taskId: string) => void;
  onFocusToday: () => void;
  focusActive: boolean;
}) {
  const { summary, focus, waiting, attention, clients, week } = view;

  const cards = [
    {
      label: "Due Today",
      value: summary.dueToday,
      hint: "Tasks due today",
      icon: CalendarCheck,
      tone: "sky",
    },
    {
      label: "Due Soon",
      value: summary.dueSoon,
      hint: "Within 3 days",
      icon: Clock,
      tone: "amber",
    },
    {
      label: "Overdue",
      value: summary.overdue,
      hint: "Past due date",
      icon: TriangleAlert,
      tone: "rose",
    },
    {
      label: "Waiting on Client",
      value: summary.waitingOnClient,
      hint: "Waiting for client",
      icon: Hourglass,
      tone: "amber",
    },
    {
      label: "Needs Review",
      value: summary.needsReview,
      hint: "Awaiting approval",
      icon: Eye,
      tone: "violet",
    },
    {
      label: "Completed This Week",
      value: summary.completedThisWeek,
      hint: "Approved and done",
      icon: CheckCircle2,
      tone: "emerald",
    },
  ] as const;

  const tones: Record<string, string> = {
    sky: "border-sky-200/70 bg-sky-50/60 text-sky-700",
    amber: "border-amber-200/70 bg-amber-50/60 text-amber-700",
    rose: "border-rose-200/70 bg-rose-50/60 text-rose-700",
    violet: "border-violet-200/70 bg-violet-50/60 text-violet-700",
    emerald: "border-emerald-200/70 bg-emerald-50/60 text-emerald-700",
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className={`rounded-2xl border p-3.5 ${tones[card.tone]}`}>
            <div className="flex items-start gap-2.5">
              <span className="rounded-xl bg-white/70 p-2">
                <card.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold">{card.label}</p>
                <p className="mt-0.5 text-2xl font-semibold leading-7 text-slate-950">
                  {card.value}
                </p>
                <p className="text-[11px] leading-4 opacity-80">{card.hint}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Left column */}
        <div className="space-y-4">
          <Panel
            title="Today's Focus"
            subtitle="Tasks you should prioritize today."
            icon={Target}
            action={
              <Button
                size="sm"
                variant={focusActive ? "primary" : "secondary"}
                onClick={onFocusToday}
              >
                {focusActive ? "Showing today" : "My Tasks Today"}
              </Button>
            }
          >
            {focus.length === 0 ? (
              <Empty>You&rsquo;re all caught up. No priority tasks right now.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {focus.map(({ task, action }) => {
                  const due = relativeDue(task.dueDate, now);
                  const guide = categoryGuide(task.category as never);

                  return (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition hover:bg-slate-50/70"
                    >
                      <div className="min-w-[10rem] flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {task.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {task.client?.companyName ?? "Internal / Agency Work"}
                        </p>
                      </div>

                      <Badge tone="slate" className="px-2 py-0.5 text-[10px] font-medium">
                        {guide?.label ?? formatEnumLabel(task.category)}
                      </Badge>

                      <Badge tone={priorityTone(task.priority)}>
                        {formatEnumLabel(task.priority)}
                      </Badge>

                      <div className="w-24 text-xs">
                        <p className="text-slate-700">{shortDate(task.dueDate)}</p>
                        <p
                          className={
                            due.tone === "overdue"
                              ? "font-medium text-rose-600"
                              : due.tone === "today" || due.tone === "soon"
                                ? "text-amber-600"
                                : "text-slate-500"
                          }
                        >
                          {due.label}
                        </p>
                      </div>

                      <p className="w-14 text-xs text-slate-500">
                        {task.estimatedHours}h
                        <span className="block text-[10px]">Est. hours</span>
                      </p>

                      <Badge tone={statusTone(task.status)}>{statusLabel(task.status)}</Badge>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpenTask(task.id)}
                      >
                        {action}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="My Clients"
            subtitle="Clients you are supporting."
            icon={Users}
          >
            {clients.length === 0 ? (
              <Empty>No client work is currently assigned to you.</Empty>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
                {clients.map((client) => (
                  <div
                    key={client.id ?? "internal"}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {client.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {client.activeTasks} active task{client.activeTasks === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {client.waitingOnClient
                        ? `${client.waitingOnClient} waiting on client`
                        : null}
                      {client.waitingOnClient && client.needsReview ? " · " : null}
                      {client.needsReview ? `${client.needsReview} needs review` : null}
                      {!client.waitingOnClient && !client.needsReview ? "Nothing parked" : null}
                    </p>

                    <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                      <div>
                        <dt className="text-slate-500">Next due</dt>
                        <dd className="font-medium text-slate-800">
                          {shortDate(client.nextDue)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Latest activity</dt>
                        <dd className="font-medium text-slate-800">
                          {client.latestActivity ? timeAgo(client.latestActivity, now) : "—"}
                        </dd>
                      </div>
                    </dl>

                    {client.id ? (
                      <Link
                        href={`/clients/${client.id}`}
                        className="mt-3 block rounded-xl border border-slate-200 py-1.5 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Open Client
                      </Link>
                    ) : (
                      <p className="mt-3 rounded-xl bg-slate-50 py-1.5 text-center text-xs text-slate-500">
                        Not tied to one account
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Panel
            title="Waiting &amp; Blocked"
            subtitle="Tasks waiting on something."
            icon={Hourglass}
          >
            {waiting.length === 0 ? (
              <Empty>Nothing is blocking your work right now.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {waiting.map(({ task, reason, since }) => (
                  <li key={task.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {task.client?.companyName ?? "Internal"} — {task.title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">{reason}</p>
                      <p className="text-[11px] text-slate-400">
                        Waiting since {shortDate(since)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenTask(task.id)}
                    >
                      View Task
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Needs My Attention"
            subtitle="Things that require your action."
            icon={AlertCircle}
          >
            {attention.length === 0 ? (
              <Empty>Nothing needs your attention right now.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attention.map((item) => {
                  const Icon = ATTENTION_ICONS[item.kind];

                  return (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <span className={`rounded-lg p-1.5 ${ATTENTION_TONES[item.kind]}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{item.title}</p>
                        <p className="truncate text-xs text-slate-600">{item.detail}</p>
                        <p className="text-[11px] text-slate-400">{timeAgo(item.when, now)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpenTask(item.taskId)}
                      >
                        {item.action}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="This Week"
            subtitle="Your progress overview."
            icon={Activity}
          >
            <dl className="grid grid-cols-3 gap-3 p-4 text-center">
              {[
                { label: "Completed", value: week.completed, tone: "text-emerald-600" },
                { label: "In Progress", value: week.inProgress, tone: "text-sky-600" },
                { label: "Needs Review", value: week.needsReview, tone: "text-violet-600" },
                { label: "Est. Hours", value: `${week.estimatedHours}h`, tone: "text-slate-700" },
                { label: "Actual Hours", value: `${week.actualHours}h`, tone: "text-amber-600" },
                { label: "Overdue", value: week.overdue, tone: "text-rose-600" },
              ].map((metric) => (
                <div key={metric.label}>
                  <dd className={`text-lg font-semibold ${metric.tone}`}>{metric.value}</dd>
                  <dt className="text-[11px] leading-4 text-slate-500">{metric.label}</dt>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      <Panel
        title="Recent Activity"
        subtitle="Latest updates from your tasks."
        icon={Activity}
      >
        {activity.length === 0 ? (
          <Empty>No recent activity yet.</Empty>
        ) : (
          <ul className="grid gap-3 p-4 md:grid-cols-2 2xl:grid-cols-3">
            {activity.map((event) => (
              <li
                key={event.id}
                className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
              >
                <span className="rounded-lg bg-white p-1.5 text-slate-500">
                  <Activity className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs leading-5 text-slate-800">{event.action}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {event.actor?.name ?? "System"} · {timeAgo(event.createdAt, now)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
