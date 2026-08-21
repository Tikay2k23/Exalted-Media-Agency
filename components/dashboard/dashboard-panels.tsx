import {
  Activity,
  AlertCircle,
  Archive,
  ArrowRightCircle,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Eye,
  Hourglass,
  MessageSquare,
  PlayCircle,
  Send,
  TriangleAlert,
  Trash2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import type {
  AttentionItem,
  ClientCard,
  ClientState,
  DashboardView,
} from "@/lib/tasks/my-work-view";

/**
 * The dashboard's panels.
 *
 * Presentational only, and server-rendered: nothing here holds state or needs
 * to. Every action is a link into a page that already exists - the task modal
 * on My Work, the client record - rather than a second copy of that behaviour
 * living on an awareness page.
 */

const TONES = {
  sky: { chip: "bg-sky-50 text-sky-600", card: "border-sky-200/70 bg-sky-50/60 text-sky-700" },
  indigo: {
    chip: "bg-indigo-50 text-indigo-600",
    card: "border-indigo-200/70 bg-indigo-50/60 text-indigo-700",
  },
  amber: {
    chip: "bg-amber-50 text-amber-600",
    card: "border-amber-200/70 bg-amber-50/60 text-amber-700",
  },
  rose: {
    chip: "bg-rose-50 text-rose-600",
    card: "border-rose-200/70 bg-rose-50/60 text-rose-700",
  },
  violet: {
    chip: "bg-violet-50 text-violet-600",
    card: "border-violet-200/70 bg-violet-50/60 text-violet-700",
  },
  emerald: {
    chip: "bg-emerald-50 text-emerald-600",
    card: "border-emerald-200/70 bg-emerald-50/60 text-emerald-700",
  },
  slate: {
    chip: "bg-slate-100 text-slate-600",
    card: "border-slate-200/70 bg-slate-50/60 text-slate-700",
  },
} as const;

type Tone = keyof typeof TONES;

function relative(value: string | Date | null, now: Date) {
  if (!value) return "—";

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

function shortDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function Panel({
  title,
  subtitle,
  link,
  linkLabel,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  link?: string;
  linkLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex flex-col rounded-2xl border border-slate-200 bg-white ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {link ? (
          <Link
            href={link}
            className="text-xs font-semibold text-sky-700 transition hover:text-sky-900"
          >
            {linkLabel} →
          </Link>
        ) : null}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-xs leading-5 text-slate-500">{children}</p>;
}

/* -------------------------------------------------------------- summary cards */

export function SummaryCards({ view }: { view: DashboardView }) {
  const cards: { label: string; value: number; hint: string; icon: LucideIcon; tone: Tone }[] = [
    {
      label: "Due Today",
      value: view.summary.dueToday,
      hint: "Tasks due today",
      icon: CalendarCheck,
      tone: "indigo",
    },
    {
      label: "Overdue",
      value: view.summary.overdue,
      hint: "Past due date",
      icon: TriangleAlert,
      tone: "rose",
    },
    {
      label: "In Progress",
      value: view.inProgress,
      hint: "Tasks in progress",
      icon: PlayCircle,
      tone: "violet",
    },
    {
      label: "Waiting on Client",
      value: view.summary.waitingOnClient,
      hint: "Waiting for client",
      icon: Hourglass,
      tone: "amber",
    },
    {
      label: "Needs Review",
      value: view.summary.needsReview,
      hint: "Waiting for approval",
      icon: Eye,
      tone: "violet",
    },
    {
      label: "Completed This Week",
      value: view.summary.completedThisWeek,
      hint: "Approved and done",
      icon: CheckCircle2,
      tone: "emerald",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-2xl border p-3 sm:p-3.5 ${TONES[card.tone].card}`}>
          {/*
            The icon sits above the text on a phone, not beside it. Two columns
            on a 375px screen gives each card about 165px; once padding, a 40px
            icon and the gap are taken out, the text column is left with under
            90px - enough to wrap "Completed This Week" onto three lines and
            leave the number looking squeezed next to it. Stacked, the label and
            the figure get the full width of the card.
          */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-2.5">
            <span className="w-fit rounded-xl bg-white/70 p-2">
              <card.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-4">{card.label}</p>
              <p className="mt-0.5 text-2xl font-semibold leading-7 text-slate-950">
                {card.value}
              </p>
              <p className="text-[11px] leading-4 opacity-80">{card.hint}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ priority alerts */

const ALERT_ICONS: Record<AttentionItem["kind"], LucideIcon> = {
  revision: MessageSquare,
  review: Eye,
  overdue: TriangleAlert,
  "due-today": CalendarCheck,
  blocked: AlertCircle,
  waiting: Hourglass,
  comment: MessageSquare,
};

const ALERT_TONES: Record<AttentionItem["kind"], Tone> = {
  revision: "violet",
  review: "sky",
  overdue: "rose",
  "due-today": "amber",
  blocked: "slate",
  waiting: "amber",
  comment: "sky",
};

export function PriorityAlerts({
  alerts,
  now,
}: {
  alerts: AttentionItem[];
  now: Date;
}) {
  return (
    <Panel
      title="Priority Alerts"
      subtitle="Important items that need your attention."
      link="/work"
      linkLabel="View all alerts"
    >
      {alerts.length === 0 ? (
        <Empty>Everything looks good. Nothing urgent needs your attention.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100">
          {alerts.map((alert) => {
            const Icon = ALERT_ICONS[alert.kind];

            return (
              <li key={alert.id} className="flex items-start gap-3 p-4">
                <span className={`rounded-lg p-2 ${TONES[ALERT_TONES[alert.kind]].chip}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{alert.title}</p>
                  <p className="truncate text-xs text-slate-600">{alert.detail}</p>
                  <p className="text-[11px] text-slate-400">{relative(alert.when, now)}</p>
                </div>
                <Link
                  href={`/work?task=${alert.taskId}`}
                  className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                >
                  {alert.action}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------ client snapshot */

const STATE_TONES: Record<ClientState, Tone> = {
  "On Track": "emerald",
  "At Risk": "rose",
  Waiting: "amber",
};

export function ClientSnapshot({ clients, now }: { clients: ClientCard[]; now: Date }) {
  return (
    <Panel
      title="Client Snapshot"
      subtitle="Clients you are supporting."
      link="/clients"
      linkLabel="View all clients"
    >
      {clients.length === 0 ? (
        <Empty>No client work is currently assigned to you.</Empty>
      ) : (
        <ul className="space-y-3 p-4">
          {clients.slice(0, 4).map((client) => (
            <li key={client.id ?? "internal"} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{client.name}</p>
                  <p className="text-xs text-slate-600">
                    {client.activeTasks} active task{client.activeTasks === 1 ? "" : "s"}
                    {client.waitingOnClient
                      ? ` · ${client.waitingOnClient} waiting on client`
                      : ""}
                    {client.needsReview ? ` · ${client.needsReview} needs review` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[STATE_TONES[client.state]].chip}`}
                >
                  {client.state}
                </span>
              </div>

              <dl className="mt-2.5 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 text-xs">
                <div>
                  <dt className="text-slate-500">Next due</dt>
                  <dd className="font-medium text-slate-800">{shortDate(client.nextDue)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Latest activity</dt>
                  <dd className="font-medium text-slate-800">
                    {relative(client.latestActivity, now)}
                  </dd>
                </div>
              </dl>

              {client.id ? (
                <Link
                  href={`/clients/${client.id}`}
                  className="mt-2.5 block rounded-lg border border-slate-200 py-1.5 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Open Client
                </Link>
              ) : (
                <p className="mt-2.5 rounded-lg bg-slate-50 py-1.5 text-center text-xs text-slate-500">
                  Not tied to one account
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------ weekly progress */

export function WeeklyProgress({ view }: { view: DashboardView }) {
  const rows: { label: string; value: string | number; icon: LucideIcon; tone: Tone }[] = [
    { label: "Completed", value: view.week.completed, icon: CheckCircle2, tone: "emerald" },
    { label: "In Progress", value: view.week.inProgress, icon: PlayCircle, tone: "sky" },
    { label: "Needs Review", value: view.week.needsReview, icon: Eye, tone: "violet" },
    {
      label: "Estimated Hours",
      value: `${view.week.estimatedHours}h`,
      icon: Hourglass,
      tone: "slate",
    },
    { label: "Actual Hours", value: `${view.week.actualHours}h`, icon: Clock, tone: "amber" },
    { label: "Overdue", value: view.week.overdue, icon: TriangleAlert, tone: "rose" },
  ];

  return (
    <Panel title="Weekly Progress" subtitle="Your performance overview.">
      <dl className="space-y-2.5 p-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2.5 text-xs text-slate-600">
              <span className={`rounded-lg p-1.5 ${TONES[row.tone].chip}`}>
                <row.icon className="h-3.5 w-3.5" />
              </span>
              {row.label}
            </dt>
            <dd className="text-sm font-semibold text-slate-950">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-600">On Time Rate</p>
          <p className="text-sm font-semibold text-emerald-600">
            {view.onTimeRate === null ? "—" : `${view.onTimeRate}%`}
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          {/*
            No bar at all when nothing has finished, rather than an empty track
            that reads as zero percent. A rate with no denominator is absent,
            not bad.
          */}
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${view.onTimeRate ?? 0}%` }}
          />
        </div>
        {view.onTimeRate === null ? (
          <p className="mt-1.5 text-[11px] text-slate-400">
            Nothing finished yet this week.
          </p>
        ) : null}
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------- workload panel */

const WORKLOAD_TONES: Record<DashboardView["workload"]["state"], Tone> = {
  Healthy: "emerald",
  "Near Capacity": "amber",
  "Over Capacity": "rose",
};

export function WorkloadPanel({ workload }: { workload: DashboardView["workload"] }) {
  // Kept inside the ring even when somebody is over capacity, so the dial reads
  // as full rather than wrapping round and looking almost empty.
  const sweep = Math.min(100, workload.percentUsed);

  return (
    <Panel title="Workload This Week" subtitle="Your capacity overview.">
      <div className="flex flex-wrap items-center gap-5 p-4">
        <div
          className="relative h-28 w-28 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(var(--workload-colour) ${sweep * 3.6}deg, rgb(241 245 249) 0deg)`,
            // Set as a variable so the ring, the badge and the figure cannot
            // drift apart.
            ["--workload-colour" as string]:
              workload.state === "Over Capacity"
                ? "rgb(225 29 72)"
                : workload.state === "Near Capacity"
                  ? "rgb(217 119 6)"
                  : "rgb(2 132 199)",
          }}
        >
          <div className="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-white">
            <span className="text-xl font-semibold text-slate-950">
              {workload.percentUsed}%
            </span>
            <span className="text-[10px] leading-3 text-slate-500">Capacity used</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-2xl font-semibold text-slate-950">
            {workload.bookedHours}h
            <span className="text-base font-medium text-slate-400">
              {" "}
              / {workload.capacityHours}h
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Available</p>
          <p className="text-lg font-semibold text-slate-800">{workload.availableHours}h</p>
          <span
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONES[WORKLOAD_TONES[workload.state]].chip}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {workload.state}
          </span>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------- recent activity */

function activityLook(action: string): { icon: LucideIcon; tone: Tone } {
  const text = action.toLowerCase();

  if (text.startsWith("assigned")) return { icon: UserPlus, tone: "sky" };
  if (text.startsWith("submitted")) return { icon: Send, tone: "violet" };
  if (text.startsWith("approved")) return { icon: CheckCircle2, tone: "emerald" };
  if (text.startsWith("requested changes")) return { icon: MessageSquare, tone: "amber" };
  if (text.startsWith("commented")) return { icon: MessageSquare, tone: "slate" };
  if (text.startsWith("moved")) return { icon: ArrowRightCircle, tone: "sky" };
  if (text.startsWith("archived") || text.startsWith("restored")) {
    return { icon: Archive, tone: "slate" };
  }
  if (text.includes("deleted")) return { icon: Trash2, tone: "rose" };

  return { icon: Activity, tone: "slate" };
}

export function RecentActivity({
  events,
  now,
}: {
  events: { id: string; action: string; createdAt: string; actorName: string | null }[];
  now: Date;
}) {
  return (
    <Panel
      title="Recent Activity"
      subtitle="Latest updates from your tasks."
      link="/work"
      linkLabel="View all activity"
    >
      {events.length === 0 ? (
        <Empty>No recent activity yet.</Empty>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {events.map((event) => {
            const look = activityLook(event.action);

            return (
              <li
                key={event.id}
                className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
              >
                <span className={`rounded-lg p-1.5 ${TONES[look.tone].chip}`}>
                  <look.icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs leading-5 text-slate-800">{event.action}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {event.actorName ?? "System"} · {relative(event.createdAt, now)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
