"use client";

import {
  CalendarClock,
  CheckCircle2,
  Download,
  Mail,
  Phone,
  TrendingUp,
  TriangleAlert,
  Upload,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { OpportunityWorkspace } from "@/components/sales/opportunity-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SalesStage } from "@/lib/data/sales-workspace-query";
import {
  DEFAULT_PROPOSAL_AGING_DAYS,
  EMPTY_SALES_FILTERS,
  applySalesFilters,
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
 * One metric, kept short.
 *
 * Deliberately a single line of chrome: this row sits between the page title
 * and the pipeline, and every extra pixel of it pushes the thing people came
 * to use further down the screen.
 */
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
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className={`shrink-0 rounded-lg p-1.5 ${TONES[tone]}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium leading-4 text-slate-500">{label}</p>
        <p className="truncate text-lg font-semibold leading-6 text-slate-950">{value}</p>
        {hint ? (
          <p className="truncate text-[10px] leading-3 text-slate-400">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Leads and Sales.
 *
 * The pipeline is the page. Everything above it is one compact row of numbers,
 * everything below it is analysis, and nothing sits beside it - a kanban squeezed
 * into two thirds of the width cannot show a readable card, and a readable card
 * is the entire point of having a board rather than a table.
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
  canConfirmPayment,
  canRetryHandoff,
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
  canConfirmPayment: boolean;
  canRetryHandoff: boolean;
  canAssign: boolean;
  serverNow: string;
}) {
  const [range, setRange] = useState<RangePreset>("week");
  const [filters, setFilters] = useState<SalesFilters>(EMPTY_SALES_FILTERS);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const now = useMemo(() => new Date(serverNow), [serverNow]);
  const agingDays = proposalAgingDays ?? DEFAULT_PROPOSAL_AGING_DAYS;
  const rangeWindow = useMemo(() => resolveRange(range, now), [range, now]);

  const metrics = useMemo(() => salesMetrics(leads, rangeWindow, now), [leads, rangeWindow, now]);
  const actions = useMemo(() => needsAction(leads, now, agingDays), [leads, now, agingDays]);
  const queue = useMemo(() => followUpQueue(leads, now), [leads, now]);
  const bySource = useMemo(() => sourcePerformance(leads, rangeWindow), [leads, rangeWindow]);
  const byRep = useMemo(() => repPerformance(leads, rangeWindow), [leads, rangeWindow]);
  const wins = useMemo(() => recentWins(leads), [leads]);

  /*
   * Filtered once, here, and handed to the workspace. Export and the two views
   * then cannot disagree about which opportunities are on screen.
   */
  const filtered = useMemo(
    () => applySalesFilters(leads, filters, now, agingDays),
    [leads, filters, now, agingDays],
  );

  // Read from the Needs Action card rather than counted again, so the metric and
  // the card below the pipeline always say the same number.
  const callsToday = actions.find((card) => card.key === "calls-today")?.count ?? 0;

  function update<K extends keyof SalesFilters>(key: K, value: SalesFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  /** Clicking a Needs Action card is a filter, not a separate screen. */
  function toggleAction(key: ActionKey) {
    update("action", filters.action === key ? "" : key);
  }

  function exportCsv() {
    const header = [
      "Opportunity ID",
      "Opportunity",
      "Contact",
      "Company",
      "Email",
      "Phone",
      "Source",
      "Campaign",
      "Owner",
      "Stage",
      "Status",
      "Tags",
      "Created",
      "Last Contact",
      "Next Action",
      "Next Follow Up",
      "Expected Close",
      "Strategy Call",
      "Proposal Sent",
      "Won",
      "Lost",
      "Lost Reason",
      "Value",
      "Final Value",
    ];

    const cell = (value: string | number | null) => {
      const text = value === null || value === undefined ? "" : String(value);
      // A leading =, + or - would be run as a formula when the file is opened.
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""').replaceAll(/\r?\n/g, " ")}"`;
    };

    const day = (value: string | null) => (value ? value.slice(0, 10) : "");

    const rows = filtered.map((lead) =>
      [
        lead.id,
        lead.opportunityName ?? lead.businessName,
        lead.contactName,
        lead.businessName,
        lead.email,
        lead.phone,
        formatEnumLabel(lead.source),
        lead.campaign,
        lead.ownerName,
        lead.stageName,
        formatEnumLabel(lead.status),
        lead.tags.join(" | "),
        day(lead.createdAt),
        day(lead.lastContactAt),
        lead.nextAction,
        day(lead.nextFollowUpAt),
        day(lead.expectedCloseAt),
        day(lead.strategyCallAt),
        day(lead.proposalSentAt),
        day(lead.wonAt),
        day(lead.lostAt),
        lead.lostReasonCode ? formatEnumLabel(lead.lostReasonCode) : "",
        lead.finalValue ?? lead.proposalValue ?? lead.opportunityValue ?? lead.budgetAmount ?? "",
        lead.finalValue ?? "",
      ]
        .map(cell)
        .join(","),
    );

    const csv = [header.map(cell).join(","), ...rows].join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `exalted-opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
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
            Manage opportunities, follow ups, and close more deals.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2">
            {canCreate ? (
              <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Import Leads
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            {canCreate ? (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Add Lead
              </Button>
            ) : null}
          </div>

          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  range === option.value
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* One compact row, so the pipeline starts high on the page. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
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
          label="Calls Today"
          value={String(callsToday)}
          hint="Booked for today"
          icon={Phone}
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
          label="Won This Month"
          value={String(metrics.wonThisMonth)}
          hint="Converted"
          icon={CheckCircle2}
          tone="emerald"
        />
        <Metric
          label="Conversion Rate"
          value={metrics.conversionRate === null ? "—" : `${metrics.conversionRate}%`}
          hint={metrics.conversionRate === null ? "No leads in range" : "Of leads in range"}
          icon={TrendingUp}
          tone="violet"
        />
      </div>

      {/*
        The pipeline, full width and immediately under the numbers. Board, list,
        filters, the drawer and every opportunity dialog live in here because
        they share one filtered array.
      */}
      <OpportunityWorkspace
        leads={leads}
        filtered={filtered}
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
        canConfirmPayment={canConfirmPayment}
        canRetryHandoff={canRetryHandoff}
        filters={filters}
        onFilters={setFilters}
        openLeadId={openLeadId}
        onOpenLead={setOpenLeadId}
        addOpen={addOpen}
        onAddOpen={setAddOpen}
        importOpen={importOpen}
        onImportOpen={setImportOpen}
      />

      {/* Needs Action, under the pipeline it filters. */}
      <Panel
        title="Needs Action"
        subtitle="Click one to filter the pipeline above."
      >
        <div className="grid gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {actions.map((card) => (
            <button
              key={card.key}
              type="button"
              onClick={() => toggleAction(card.key)}
              className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition ${
                filters.action === card.key
                  ? "border-slate-950 bg-slate-50"
                  : "border-slate-200 hover:bg-slate-50/70"
              }`}
            >
              <span
                className={`shrink-0 rounded-lg p-1.5 ${TONES[ACTION_TONES[card.key]]}`}
              >
                <TriangleAlert className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold leading-6 text-slate-950">
                  {card.count}
                </span>
                <span className="block truncate text-[11px] font-medium text-slate-700">
                  {card.label}
                </span>
                <span className="block truncate text-[10px] text-slate-500">{card.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Panel>

      {/* Secondary analysis, below the work. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Follow Ups Due" subtitle="Most urgent first.">
          {queue.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">Nothing is due right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {queue.map(({ lead, isOverdue, overdueDays }) => (
                <li key={lead.id} className="flex items-start gap-2.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {lead.contactName}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">{lead.businessName}</p>
                    <p className={`text-[11px] ${isOverdue ? "text-rose-600" : "text-amber-600"}`}>
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
                        className="rounded-lg border border-slate-200 p-1.5 text-emerald-600 transition hover:bg-slate-50"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                    {lead.email ? (
                      <a
                        href={`mailto:${lead.email}`}
                        aria-label={`Email ${lead.contactName}`}
                        className="rounded-lg border border-slate-200 p-1.5 text-sky-600 transition hover:bg-slate-50"
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

        <Panel title="Lead Sources" subtitle="Click a row to filter by source.">
          {bySource.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">
              No leads came in during this range.
            </p>
          ) : (
            <div className="w-full min-w-0 max-w-full overflow-x-auto">
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
            </div>
          )}
        </Panel>

        {/*
          Somebody else's numbers. Only the seats that manage sales see this;
          the server decides, and sends nothing otherwise.
        */}
        {canSeeTeam ? (
          <Panel title="Sales Performance" subtitle="For the selected range.">
            {byRep.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">Nothing to compare yet.</p>
            ) : (
              <div className="w-full min-w-0 max-w-full overflow-x-auto">
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
            </div>
            )}
          </Panel>
        ) : null}

        <Panel title="Recent Wins" subtitle="Click one to open it.">
          {wins.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">No wins recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {wins.map((lead) => (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => setOpenLeadId(lead.id)}
                    className="flex w-full items-start justify-between gap-2 p-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-900">
                        {lead.businessName}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {formatEnumLabel(lead.source)}
                        {lead.wonByName ? ` · ${lead.wonByName}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Badge tone="emerald">Won</Badge>
                      <span className="mt-0.5 block text-[11px] font-medium text-slate-700">
                        {lead.finalValue ? money(lead.finalValue) : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
