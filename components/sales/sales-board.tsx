"use client";

import {
  CalendarClock,
  CheckCircle2,
  FileText,
  Filter,
  Mail,
  Phone,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { OpportunityWorkspace } from "@/components/sales/opportunity-workspace";
import { Badge } from "@/components/ui/badge";
import type { SalesStage } from "@/lib/data/sales-workspace-query";
import {
  DEFAULT_PROPOSAL_AGING_DAYS,
  EMPTY_SALES_FILTERS,
  followUpLabel,
  followUpQueue,
  needsAction,
  recentWins,
  repPerformance,
  resolveRange,
  salesMetrics,
  sourcePerformance,
  type ActionKey,
  type RangePreset,
  type SalesFilters,
  type SalesLead,
} from "@/lib/sales/sales-view";
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

const RANGES: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "last30", label: "Last 30 Days" },
];

const ACTION_TONES: Record<ActionKey, Tone> = {
  overdue: "rose",
  "calls-today": "amber",
  "aging-proposals": "sky",
  "never-contacted": "violet",
  "no-follow-up": "amber",
};

function money(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 p-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone: Tone;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-white p-3.5">
      <span className={`rounded-xl p-2 ${TONES[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold leading-4 text-slate-600">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold leading-7 text-slate-950">{value}</p>
        {hint ? <p className="text-[11px] leading-4 text-slate-500">{hint}</p> : null}
      </div>
    </div>
  );
}

/**
 * Leads and Sales.
 *
 * Built around the questions a salesperson opens it to answer: who needs
 * chasing today, which proposals have gone quiet, and what happens next on
 * every open opportunity. Not a generic CRM board - the pipeline is a strip
 * rather than a kanban, because dragging cards is not the job; making the calls
 * is.
 *
 * Every number is derived in the browser from the rows the server sent, so a
 * Needs Action card that says three always filters to three.
 */
export function SalesBoard({
  stages,
  leads,
  owners,
  sources,
  tags,
  campaigns,
  proposalAgingDays,
  canSeeTeam,
  canCreate,
  canEdit,
  canConvert,
  canAssign,
  serverNow,
}: {
  stages: SalesStage[];
  leads: SalesLead[];
  owners: { id: string; name: string }[];
  sources: string[];
  tags: string[];
  campaigns: string[];
  proposalAgingDays: number | null;
  canSeeTeam: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canConvert: boolean;
  canAssign: boolean;
  serverNow: string;
}) {
  const [range, setRange] = useState<RangePreset>("week");
  const [filters, setFilters] = useState<SalesFilters>(EMPTY_SALES_FILTERS);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const now = useMemo(() => new Date(serverNow), [serverNow]);
  const agingDays = proposalAgingDays ?? DEFAULT_PROPOSAL_AGING_DAYS;
  const rangeWindow = useMemo(() => resolveRange(range, now), [range, now]);

  const metrics = useMemo(() => salesMetrics(leads, rangeWindow, now), [leads, rangeWindow, now]);
  const actions = useMemo(() => needsAction(leads, now, agingDays), [leads, now, agingDays]);
  const queue = useMemo(() => followUpQueue(leads, now), [leads, now]);
  const bySource = useMemo(() => sourcePerformance(leads, rangeWindow), [leads, rangeWindow]);
  const byRep = useMemo(() => repPerformance(leads, rangeWindow), [leads, rangeWindow]);
  const wins = useMemo(() => recentWins(leads), [leads]);

  function update<K extends keyof SalesFilters>(key: K, value: SalesFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  /** Clicking a Needs Action card is a filter, not a separate screen. */
  function toggleAction(key: ActionKey) {
    update("action", filters.action === key ? "" : key);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Leads and Sales
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Turn prospects into paying clients. Track every lead, follow up, and opportunity.
          </p>
        </div>

        {/*
          Add Lead, Import and Export live on the pipeline toolbar rather than
          up here. Two Add Lead buttons on one screen is two answers to "where
          do I add a lead", and the one beside the pipeline is the one people
          are already looking at.
        */}
      </div>

      {/* Date range */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {RANGES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRange(option.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              range === option.value
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 min-[1800px]:grid-cols-8">
        <Metric
          label="New Leads"
          value={String(metrics.newLeads)}
          hint="In this range"
          icon={UserPlus}
          tone="indigo"
        />
        <Metric
          label="Follow Ups Due"
          value={String(metrics.followUpsDue)}
          hint={metrics.followUpsOverdue ? `${metrics.followUpsOverdue} overdue` : "None overdue"}
          icon={CalendarClock}
          tone={metrics.followUpsOverdue ? "rose" : "amber"}
        />
        <Metric
          label="Calls Booked"
          value={String(metrics.callsBooked)}
          hint="Upcoming"
          icon={Phone}
          tone="emerald"
        />
        <Metric
          label="Qualified"
          value={String(metrics.qualified)}
          hint="Active opportunities"
          icon={Filter}
          tone="violet"
        />
        <Metric
          label="Proposals Open"
          value={String(metrics.proposalsOpen)}
          hint="Waiting for decision"
          icon={FileText}
          tone="sky"
        />
        <Metric
          label="Won This Month"
          value={String(metrics.wonThisMonth)}
          hint="Converted"
          icon={CheckCircle2}
          tone="emerald"
        />
        <Metric
          label="Pipeline Value"
          value={money(metrics.pipelineValue)}
          hint="Open opportunities"
          icon={TrendingUp}
          tone="amber"
        />
        <Metric
          label="Conversion Rate"
          value={metrics.conversionRate === null ? "—" : `${metrics.conversionRate}%`}
          hint={metrics.conversionRate === null ? "No leads in range" : "Of leads in range"}
          icon={TrendingUp}
          tone="violet"
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.6fr)_minmax(18rem,1fr)]">
        <div className="space-y-4">
          {/* Needs Action */}
          <Panel
            title="Needs Action"
            subtitle="Important items that need attention. Click one to filter the list."
          >
            <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-5">
              {actions.map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => toggleAction(card.key)}
                  className={`rounded-xl border p-3 text-left transition ${
                    filters.action === card.key
                      ? "border-slate-950 bg-slate-50"
                      : "border-slate-200 hover:bg-slate-50/70"
                  }`}
                >
                  <span className={`inline-flex rounded-lg p-1.5 ${TONES[ACTION_TONES[card.key]]}`}>
                    <TriangleAlert className="h-3.5 w-3.5" />
                  </span>
                  <p className="mt-2 text-2xl font-semibold leading-7 text-slate-950">
                    {card.count}
                  </p>
                  <p className="text-xs font-medium text-slate-700">{card.label}</p>
                  <p className="text-[11px] text-slate-500">{card.hint}</p>
                </button>
              ))}
            </div>
          </Panel>

          {/*
            Board, list, filters, the drawer and every opportunity dialog. One
            component because they share one filtered array - the whole point
            of the two views is that they are two renderings of the same deals.
          */}
          <OpportunityWorkspace
            leads={leads}
            stages={stages}
            owners={owners}
            sources={sources}
            tags={tags}
            campaigns={campaigns}
            now={now}
            agingDays={agingDays}
            canCreate={canCreate}
            canEdit={canEdit}
            canAssign={canAssign}
            canConvert={canConvert}
            filters={filters}
            onFilters={setFilters}
            openLeadId={openLeadId}
            onOpenLead={setOpenLeadId}
          />

        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <Panel title="Follow Ups Due" subtitle="Most urgent first.">
            {queue.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                Nothing is due right now.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {queue.map(({ lead, isOverdue, overdueDays }) => (
                  <li key={lead.id} className="flex items-start gap-2.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {lead.contactName}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">{lead.businessName}</p>
                      <p
                        className={`text-[11px] ${isOverdue ? "text-rose-600" : "text-amber-600"}`}
                      >
                        {isOverdue
                          ? `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`
                          : followUpLabel(lead.nextFollowUpAt, now).label}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          aria-label={`Call ${lead.contactName}`}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          aria-label={`Email ${lead.contactName}`}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setOpenLeadId(lead.id)}
                        className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-200"
                      >
                        Open
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Lead Sources" subtitle="For the selected range.">
            {bySource.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                No leads came in during this range.
              </p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Source</th>
                    <th className="px-2 py-2 text-right font-semibold">Leads</th>
                    <th className="px-2 py-2 text-right font-semibold">Won</th>
                    <th className="px-4 py-2 text-right font-semibold">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bySource.map((row) => (
                    <tr
                      key={row.source}
                      onClick={() =>
                        update("source", filters.source === row.source ? "" : row.source)
                      }
                      className={`cursor-pointer transition hover:bg-slate-50 ${
                        filters.source === row.source ? "bg-sky-50/60" : ""
                      }`}
                    >
                      <td className="px-4 py-2 text-slate-700">{formatEnumLabel(row.source)}</td>
                      <td className="px-2 py-2 text-right text-slate-700">{row.leads}</td>
                      <td className="px-2 py-2 text-right text-slate-700">{row.converted}</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-900">
                        {row.rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/*
            Somebody else's numbers. Only the seats that manage sales see this;
            the server decides, and sends nothing otherwise.
          */}
          {canSeeTeam ? (
            <Panel title="Sales Performance" subtitle="For the selected range.">
              {byRep.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">
                  Nothing to compare yet.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Member</th>
                      <th className="px-2 py-2 text-right font-semibold">Leads</th>
                      <th className="px-2 py-2 text-right font-semibold">Won</th>
                      <th className="px-4 py-2 text-right font-semibold">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {byRep.map((row) => (
                      <tr key={row.ownerId}>
                        <td className="px-4 py-2 text-slate-700">
                          <span className="block truncate">{row.name}</span>
                        </td>
                        <td className="px-2 py-2 text-right text-slate-700">{row.leads}</td>
                        <td className="px-2 py-2 text-right text-slate-700">{row.converted}</td>
                        <td className="px-4 py-2 text-right font-medium text-slate-900">
                          {row.rate}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          ) : null}

          <Panel title="Recent Wins">
            {wins.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                No wins recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {wins.map((lead) => (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => setOpenLeadId(lead.id)}
                      className="flex w-full items-start justify-between gap-2 p-3 text-left transition hover:bg-slate-50"
                    >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {lead.businessName}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {formatEnumLabel(lead.source)}
                        {lead.wonByName ? ` · ${lead.wonByName}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone="emerald">Won</Badge>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-700">
                        {lead.finalValue ? money(lead.finalValue) : ""}
                      </p>
                    </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

    </div>
  );
}
