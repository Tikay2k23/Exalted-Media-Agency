"use client";

import {
  Activity as ActivityIcon,
  ArrowRight,
  Ban,
  Bug,
  CalendarDays,
  CalendarClock,
  ChartNoAxesColumn,
  CircleCheck,
  ClipboardList,
  Clock,
  FileText,
  Flag,
  Mail,
  MessageSquare,
  Phone,
  Rocket,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyPanel, Monogram, money } from "@/components/clients/client-bits";
import { ClientOverviewFooter } from "@/components/clients/client-overview-footer";
import { TabLink } from "@/components/clients/client-tabs";
import { Badge } from "@/components/ui/badge";
import {
  activityStamp,
  relativeDayLabel,
  workBreakdown,
} from "@/lib/clients/client-overview-cards";
import { attentionItems } from "@/lib/clients/client-overview-attention";
import {
  type MetricKey,
  type MetricTone,
  agencyMetrics,
  healthScoreColor,
  healthScoreLabel,
} from "@/lib/clients/client-overview-metrics";
import {
  HEALTH_LABELS,
  type AttentionKey,
  type ClientRow,
  healthFromStatus,
  nextMilestone,
} from "@/lib/clients/client-workspace";
import { cn, formatEnumLabel } from "@/lib/utils";

export interface OverviewService {
  id: string;
  name: string;
  serviceType: string;
  status: string;
  ownerName: string | null;
  startDate: string | null;
}

export interface OverviewContact {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  isDecisionMaker: boolean;
  isApprover: boolean;
}

export interface OverviewActivity {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
}

/**
 * One client, at a glance.
 *
 * A summary and only a summary: every figure is read from a record that already
 * exists, and every control goes to the tab that owns the work rather than
 * opening a second copy of a form living somewhere else. In particular the
 * intake form is never sent from here - that belongs to Strategy, and a second
 * send button would rotate the client's link from a page whose job is to
 * report.
 */

/* -------------------------------------------------------------------------- */
/* Shared furniture                                                           */
/* -------------------------------------------------------------------------- */

function Panel({
  title,
  badge,
  action,
  children,
  className,
}: {
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-slate-950">{title}</h2>
          {badge}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** The blue "View all →" every panel header carries. */
function PanelLink({
  tab,
  href,
  children,
}: {
  tab?: Parameters<typeof TabLink>[0]["tab"];
  href?: string;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-sky-600 transition hover:text-sky-700";

  if (href) {
    return (
      <Link href={href} className={className}>
        {children}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    );
  }

  return (
    <TabLink tab={tab!} className={className}>
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </TabLink>
  );
}

/* -------------------------------------------------------------------------- */
/* The six figures across the top                                             */
/* -------------------------------------------------------------------------- */

const METRIC_ICONS: Record<MetricKey, typeof Users> = {
  active: Users,
  "on-track": CircleCheck,
  waiting: Clock,
  "at-risk": TriangleAlert,
  launching: Rocket,
  renewals: CalendarClock,
};

const METRIC_TONES: Record<MetricTone, string> = {
  violet: "bg-violet-50 text-violet-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  sky: "bg-sky-50 text-sky-600",
  indigo: "bg-indigo-50 text-indigo-600",
};

function MetricRow({ clients, now }: { clients: ClientRow[]; now: Date }) {
  const metrics = useMemo(() => agencyMetrics(clients, now), [clients, now]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => {
        const Icon = METRIC_ICONS[metric.key];

        return (
          <div
            key={metric.key}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <span
              aria-hidden
              className={cn("shrink-0 rounded-xl p-2.5", METRIC_TONES[metric.tone])}
            >
              <Icon className="h-4 w-4" />
            </span>

            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-600">{metric.label}</p>
              <p className="mt-0.5 text-2xl font-semibold leading-8 text-slate-950">
                {metric.value}
              </p>
              {metric.href ? (
                <Link
                  href={metric.href}
                  className="text-[11px] font-medium text-sky-600 transition hover:text-sky-700"
                >
                  {metric.detail}
                </Link>
              ) : (
                <p className="truncate text-[11px] text-slate-400">{metric.detail}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Needs attention                                                            */
/* -------------------------------------------------------------------------- */

const ATTENTION_ICONS: Record<AttentionKey, typeof Users> = {
  blocker: Ban,
  "overdue-work": ClipboardList,
  "missing-access": TriangleAlert,
  "intake-incomplete": FileText,
  "approval-overdue": CircleCheck,
  "open-defect": Bug,
  "report-overdue": ChartNoAxesColumn,
  "renewal-approaching": CalendarDays,
  "no-activity": Clock,
  "no-next-action": Flag,
};

/** How many rows fit before the panel offers to show the rest. */
const ATTENTION_PREVIEW = 3;

function NeedsAttention({ client, now }: { client: ClientRow; now: Date }) {
  const items = useMemo(() => attentionItems(client, now), [client, now]);
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? items : items.slice(0, ATTENTION_PREVIEW);

  return (
    <Panel
      title="Needs Attention"
      badge={
        items.length > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">
            {items.length}
          </span>
        ) : null
      }
      action={
        /*
          * Only offered when there is genuinely more to see. The panel already
          * holds every item this account has, so "View all" reveals the rest
          * here rather than pretending to open a page that does not exist -
          * the Clients list keeps its filters in component state, so a link
          * claiming to filter it would land on an unfiltered list.
          */
        items.length > ATTENTION_PREVIEW ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-sky-600 transition hover:text-sky-700"
          >
            {expanded ? "Show less" : "View all"}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null
      }
    >
      {items.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyPanel>Nothing on this account needs attention.</EmptyPanel>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {shown.map((item) => {
            const Icon = ATTENTION_ICONS[item.key];

            return (
              <li key={item.key} className="flex items-start gap-3 p-4">
                <span
                  aria-hidden
                  className={cn(
                    "shrink-0 rounded-xl p-2.5",
                    item.tone === "rose"
                      ? "bg-rose-50 text-rose-500"
                      : "bg-amber-50 text-amber-500",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">{item.context}</p>
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      item.tone === "rose" ? "text-rose-600" : "text-amber-600",
                    )}
                  >
                    {item.description}
                  </p>
                </div>

                <TabLink
                  tab={item.action.tab}
                  className={cn(
                    "shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                    item.tone === "rose"
                      ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                      : "border-amber-200 text-amber-600 hover:bg-amber-50",
                  )}
                >
                  {item.action.label}
                </TabLink>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Account health                                                             */
/* -------------------------------------------------------------------------- */

/** Length of the semicircle the dial draws along, for the dash offset. */
const ARC = Math.PI * 58;
const ARC_PATH = "M 12 70 A 58 58 0 0 1 128 70";

function HealthDial({ score }: { score: number | null }) {
  const filled = score === null ? 0 : (Math.min(Math.max(score, 0), 100) / 100) * ARC;

  return (
    <div className="relative shrink-0">
      <svg viewBox="0 0 140 82" className="h-[82px] w-[140px]" role="presentation">
        <path
          d={ARC_PATH}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {score === null ? null : (
          <path
            d={ARC_PATH}
            fill="none"
            stroke={healthScoreColor(score)}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${ARC}`}
          />
        )}
      </svg>

      <div className="absolute inset-x-0 bottom-1 text-center">
        <p className="text-2xl font-semibold leading-7 text-slate-950">
          {score === null ? "—" : score}
        </p>
        <p className="text-[11px] text-slate-500">
          {score === null ? "Not scored" : healthScoreLabel(score)}
        </p>
      </div>
    </div>
  );
}

function AccountHealth({
  client,
  healthNote,
  now,
}: {
  client: ClientRow;
  healthNote: {
    assessedAt: string;
    assessedBy: string | null;
    summary: string | null;
    healthScore: number | null;
  } | null;
  now: Date;
}) {
  const health = healthFromStatus(client.healthStatus, {
    hasBlocker: Boolean(client.currentBlocker?.trim()),
  });

  /*
   * The dial only ever draws a score somebody recorded. An assessment can be
   * saved without one, and inventing a number to fill the arc would make it the
   * most confident wrong thing on the page.
   */
  const score = healthNote?.healthScore ?? null;

  const summary =
    healthNote?.summary?.trim()
    || (health === "ON_TRACK"
      ? "No open risks recorded against this account."
      : health === "BLOCKED"
        ? "Nothing can move on this account until the blocker clears."
        : health === "AT_RISK"
          ? "This account needs attention now."
          : "No health assessment has been recorded for this account yet.");

  return (
    <Panel
      title="Account Health"
      action={<PanelLink tab="reports">View details</PanelLink>}
    >
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 p-4">
        <HealthDial score={score} />

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-semibold",
              health === "ON_TRACK" && "text-emerald-600",
              health === "NEEDS_ATTENTION" && "text-amber-600",
              (health === "AT_RISK" || health === "BLOCKED") && "text-rose-600",
            )}
          >
            {HEALTH_LABELS[health]}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{summary}</p>

          {healthNote ? (
            <p className="mt-1 text-[11px] text-slate-400">
              Assessed {relativeDayLabel(healthNote.assessedAt, now)}
              {healthNote.assessedBy ? ` by ${healthNote.assessedBy}` : ""}
            </p>
          ) : null}

          <TabLink
            tab="reports"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <ActivityIcon className="h-3.5 w-3.5" aria-hidden />
            Health assessment
          </TabLink>
        </div>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Active work                                                                */
/* -------------------------------------------------------------------------- */

/** Tailwind class -> the colour the conic gradient needs. */
const RING_COLORS: Record<string, string> = {
  "bg-emerald-500": "#10b981",
  "bg-sky-500": "#0ea5e9",
  "bg-rose-500": "#f43f5e",
  "bg-amber-500": "#f59e0b",
  "bg-slate-300": "#cbd5e1",
};

/**
 * The donut, as a single conic-gradient.
 *
 * Segments follow the order the buckets come back, so the ring and the legend
 * beside it read the same way round. A conic gradient rather than a charting
 * library: it is five numbers, and the page should not pull a rendering
 * dependency to draw them.
 */
function ringGradient(work: { total: number; buckets: { count: number; color: string }[] }) {
  if (work.total === 0) return "#e2e8f0";

  let cursor = 0;
  const stops = work.buckets.map((bucket) => {
    const start = (cursor / work.total) * 360;
    cursor += bucket.count;
    const end = (cursor / work.total) * 360;

    return `${RING_COLORS[bucket.color] ?? "#cbd5e1"} ${start}deg ${end}deg`;
  });

  return `conic-gradient(${stops.join(", ")})`;
}

function ActiveWork({
  tasks,
  now,
}: {
  tasks: { status: string; dueDate: string | null }[];
  now: Date;
}) {
  const work = useMemo(() => workBreakdown(tasks, now), [tasks, now]);

  return (
    <Panel title="Active Work" action={<PanelLink tab="tasks">View all tasks</PanelLink>}>
      {work.total === 0 ? (
        <div className="px-4 pb-4">
          <EmptyPanel>No active work for this client.</EmptyPanel>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 p-4">
          <div
            className="relative h-[104px] w-[104px] shrink-0 rounded-full"
            style={{ background: ringGradient(work) }}
            role="img"
            aria-label={`${work.total} tasks: ${work.buckets
              .map((bucket) => `${bucket.count} ${bucket.label.toLowerCase()}`)
              .join(", ")}`}
          >
            <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-white">
              <span className="text-xl font-semibold leading-6 text-slate-950">
                {work.total}
              </span>
              <span className="text-[11px] text-slate-500">
                {work.total === 1 ? "Task" : "Tasks"}
              </span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-2">
            {work.buckets.map((bucket) => (
              <li key={bucket.key} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden
                  className={cn("h-2 w-2 shrink-0 rounded-full", bucket.color)}
                />
                <span className="min-w-0 flex-1 truncate text-slate-600">{bucket.label}</span>
                <span className="shrink-0 text-slate-500">
                  {bucket.count} ({Math.round((bucket.count / work.total) * 100)}%)
                </span>
              </li>
            ))}
            {work.overdue > 0 ? (
              <li className="flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[11px] text-rose-600">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {work.overdue} still open past its due date
              </li>
            ) : null}
          </ul>
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* The rest of the bottom row                                                 */
/* -------------------------------------------------------------------------- */

/** Where the timeline dot takes its colour from, by what the entry says. */
function activityTone(action: string) {
  const text = action.toLowerCase();

  if (text.includes("complete") || text.includes("approv") || text.includes("received")) {
    return "bg-emerald-500";
  }
  if (text.includes("moved") || text.includes("stage")) return "bg-violet-500";
  if (text.includes("overdue") || text.includes("blocked")) return "bg-rose-500";

  return "bg-sky-500";
}

function RecentActivity({
  activity,
  now,
}: {
  activity: OverviewActivity[];
  now: Date;
}) {
  const shown = activity.slice(0, 4);

  return (
    <Panel
      title="Recent Activity"
      action={<PanelLink tab="activity">View all activity</PanelLink>}
    >
      {shown.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyPanel>Nothing recorded on this account yet.</EmptyPanel>
        </div>
      ) : (
        <ol className="relative border-t border-slate-100 p-4">
          {/* The rail behind the dots. Stops at the last one rather than
              running past it into empty space. */}
          <span
            aria-hidden
            className="absolute bottom-9 left-[21px] top-7 w-px bg-slate-200"
          />

          {shown.map((entry) => (
            <li key={entry.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
              <span
                aria-hidden
                className={cn(
                  "relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full ring-4 ring-white",
                  activityTone(entry.action),
                )}
              />
              <Monogram name={entry.actorName} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs leading-5 text-slate-800">{entry.action}</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {activityStamp(entry.createdAt, now)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function ActiveServices({
  services,
  client,
  canSeeFinance,
}: {
  services: OverviewService[];
  client: ClientRow;
  canSeeFinance: boolean;
}) {
  return (
    <Panel
      title="Active Services"
      action={<PanelLink tab="services">Manage services</PanelLink>}
      className="justify-between"
    >
      {services.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyPanel>
            No delivery projects yet. Each service the agency runs for this account is a
            project.
          </EmptyPanel>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {services.slice(0, 3).map((service) => (
              <li key={service.id} className="flex items-center gap-3 p-4">
                <span
                  aria-hidden
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-semibold text-slate-500"
                >
                  {service.name.slice(0, 2).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {service.name}
                  </p>
                  {/*
                    * The service type and who runs it, not a price. Projects
                    * carry no monetary value in this application - only the
                    * account does - so a per-service figure here would be a
                    * number nobody entered.
                    */}
                  <p className="truncate text-[11px] text-slate-500">
                    {formatEnumLabel(service.serviceType)}
                    {service.ownerName ? ` · ${service.ownerName}` : ""}
                  </p>
                </div>

                <Badge tone={service.status === "ACTIVE" ? "emerald" : "slate"}>
                  {formatEnumLabel(service.status)}
                </Badge>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <PanelLink tab="services">View all services ({services.length})</PanelLink>
            {canSeeFinance && client.monthlyValue !== null ? (
              <span className="text-[11px] text-slate-400">
                {money(client.monthlyValue)} / month on the account
              </span>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
}

function KeyContact({
  contacts,
  client,
}: {
  contacts: OverviewContact[];
  client: ClientRow;
}) {
  /*
   * Falls back to the account's own contact fields.
   *
   * Most accounts have no ClientContact rows at all - the primary contact is
   * the name, email and phone on the client record, which is what the header
   * prints. Showing "no contacts recorded" beside a header displaying that
   * person's email would be the page contradicting itself.
   */
  const fallback: OverviewContact | null = client.clientName
    ? {
        id: "account-primary",
        name: client.clientName,
        role: null,
        email: client.contactEmail,
        phone: client.contactPhone,
        isPrimary: true,
        isDecisionMaker: false,
        isApprover: false,
      }
    : null;

  const primary = contacts.find((contact) => contact.isPrimary) ?? contacts[0] ?? fallback;
  const approver = contacts.find((contact) => contact.isApprover) ?? null;

  return (
    <Panel
      title="Key Contact"
      action={<PanelLink tab="contacts">Manage contacts</PanelLink>}
      className="justify-between"
    >
      {!primary ? (
        <div className="px-4 pb-4">
          <EmptyPanel>
            No contacts recorded. Add the people who approve and pay.
          </EmptyPanel>
        </div>
      ) : (
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-start gap-3">
            <Monogram name={primary.name} size="lg" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-slate-900">{primary.name}</p>
                {primary.isPrimary ? <Badge tone="violet">Primary Contact</Badge> : null}
              </div>

              {primary.email ? (
                <a
                  href={`mailto:${primary.email}`}
                  className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-slate-500 hover:text-sky-700"
                >
                  <Mail className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{primary.email}</span>
                </a>
              ) : null}
              {primary.phone ? (
                <a
                  href={`tel:${primary.phone}`}
                  className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 hover:text-emerald-700"
                >
                  <Phone className="h-3 w-3 shrink-0" aria-hidden />
                  {primary.phone}
                </a>
              ) : null}
            </div>
          </div>

          {/*
            * Opens the person's own mail client with the contact already
            * addressed. This application deliberately sends no client-facing
            * mail of its own - the intake link is copied out by hand - so a
            * button claiming to send from here would be the only thing on the
            * page that does not do what it says.
            */}
          {primary.email ? (
            <a
              href={`mailto:${primary.email}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              Send message
            </a>
          ) : null}

          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Authorized Approver
            </p>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-medium text-slate-800">
                {approver?.name ?? "Nobody assigned"}
              </p>
              <Badge tone={approver ? "emerald" : "slate"}>
                {approver ? "Confirmed" : "Not assigned"}
              </Badge>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

export function ClientOverview({
  client,
  clients,
  services,
  contacts,
  activity,
  tasks,
  healthNote,
  canSeeFinance,
  serverNow,
}: {
  client: ClientRow;
  /** Every account this person may see, for the portfolio row at the top. */
  clients: ClientRow[];
  services: OverviewService[];
  contacts: OverviewContact[];
  activity: OverviewActivity[];
  tasks: { status: string; dueDate: string | null }[];
  healthNote: {
    assessedAt: string;
    assessedBy: string | null;
    summary: string | null;
    healthScore: number | null;
  } | null;
  canSeeFinance: boolean;
  serverNow: string;
}) {
  const now = useMemo(() => new Date(serverNow), [serverNow]);
  const next = useMemo(() => nextMilestone(client, now), [client, now]);

  return (
    <div className="space-y-4">
      <MetricRow clients={clients} now={now} />

      {/*
        * The reference splits this band 55/45: everything wrong with the
        * account on the left, what is coming and how it is doing on the right.
        * minmax(0,…) rather than bare fr, or a long blocker string sets the
        * left column's minimum width and squeezes the right one off the grid.
        */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        <NeedsAttention client={client} now={now} />

        <div className="space-y-4">
          <Panel
            title="Upcoming Milestone"
            action={<PanelLink tab="journey">View journey</PanelLink>}
          >
            {next ? (
              <div className="px-4 pb-4">
                <div className="flex items-start gap-3 rounded-xl bg-sky-50/70 p-4">
                  <span
                    aria-hidden
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600"
                  >
                    <Flag className="h-5 w-5" />
                  </span>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">{next.name}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {formatEnumLabel(next.source)} milestone for {client.companyName}.
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-600">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                      <span className="text-slate-400">Target:</span>
                      {new Date(next.dueAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      <span className="text-slate-400">
                        ({relativeDayLabel(next.dueAt, now)})
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 pb-4">
                <EmptyPanel>No upcoming milestone on this account.</EmptyPanel>
              </div>
            )}
          </Panel>

          <AccountHealth client={client} healthNote={healthNote} now={now} />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ActiveWork tasks={tasks} now={now} />
        <RecentActivity activity={activity} now={now} />
        <ActiveServices services={services} client={client} canSeeFinance={canSeeFinance} />
        <KeyContact contacts={contacts} client={client} />
      </div>

      <ClientOverviewFooter loadedAt={serverNow} />
    </div>
  );
}
