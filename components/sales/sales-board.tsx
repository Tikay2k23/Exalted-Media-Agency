"use client";

import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  Filter,
  Mail,
  Phone,
  Search,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { LeadConvertDialog, LeadFormDialog } from "@/components/sales/lead-dialogs";
import { RowMenu } from "@/components/work/row-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SalesStage } from "@/lib/data/sales-workspace-query";
import {
  DEFAULT_PROPOSAL_AGING_DAYS,
  EMPTY_SALES_FILTERS,
  applySalesFilters,
  followUpLabel,
  isOpen,
  followUpQueue,
  hasActiveFilters,
  lastContactLabel,
  needsAction,
  pipelineCounts,
  proposalAgeDays,
  recentWins,
  repPerformance,
  resolveRange,
  salesMetrics,
  sourcePerformance,
  type ActionKey,
  type RangePreset,
  type SalesFilters,
  type SalesLead,
  type SalesSort,
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

const SORTS: { value: SalesSort; label: string }[] = [
  { value: "follow-up-soonest", label: "Follow Up Soonest" },
  { value: "most-overdue", label: "Most Overdue" },
  { value: "newest", label: "Newest Lead" },
  { value: "oldest", label: "Oldest Lead" },
  { value: "highest-value", label: "Highest Value" },
  { value: "recently-contacted", label: "Recently Contacted" },
];

const ACTION_TONES: Record<ActionKey, Tone> = {
  overdue: "rose",
  "calls-today": "amber",
  "aging-proposals": "sky",
  "never-contacted": "violet",
  "no-follow-up": "amber",
};

const PAGE_SIZES = [10, 25, 50];

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
        <p className="truncate text-xs font-semibold text-slate-600">{label}</p>
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  /*
   * The create and convert forms already existed and are reused as-is. Building
   * a second lead form would have given the agency two ways to create a lead
   * that drift apart.
   */
  const [formLeadId, setFormLeadId] = useState<string | null | "new">(null);
  const [convertLeadId, setConvertLeadId] = useState<string | null>(null);

  const now = useMemo(() => new Date(serverNow), [serverNow]);
  const agingDays = proposalAgingDays ?? DEFAULT_PROPOSAL_AGING_DAYS;
  const rangeWindow = useMemo(() => resolveRange(range, now), [range, now]);

  const metrics = useMemo(() => salesMetrics(leads, rangeWindow, now), [leads, rangeWindow, now]);
  const actions = useMemo(() => needsAction(leads, now, agingDays), [leads, now, agingDays]);
  const counts = useMemo(() => pipelineCounts(leads, stages), [leads, stages]);
  const queue = useMemo(() => followUpQueue(leads, now), [leads, now]);
  const bySource = useMemo(() => sourcePerformance(leads, rangeWindow), [leads, rangeWindow]);
  const byRep = useMemo(() => repPerformance(leads, rangeWindow), [leads, rangeWindow]);
  const wins = useMemo(() => recentWins(leads), [leads]);

  const filtered = useMemo(
    () => applySalesFilters(leads, filters, now, agingDays),
    [leads, filters, now, agingDays],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const openLead = leads.find((lead) => lead.id === openLeadId) ?? null;
  const convertLead = leads.find((lead) => lead.id === convertLeadId) ?? null;

  function update<K extends keyof SalesFilters>(key: K, value: SalesFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  /** Clicking a Needs Action card is a filter, not a separate screen. */
  function toggleAction(key: ActionKey) {
    update("action", filters.action === key ? "" : key);
  }

  function exportCsv() {
    const header = [
      "Lead ID",
      "Name",
      "Company",
      "Email",
      "Phone",
      "Source",
      "Owner",
      "Stage",
      "Status",
      "Created",
      "Last Contact",
      "Next Action",
      "Next Follow Up",
      "Strategy Call",
      "Proposal Sent",
      "Won",
      "Lost",
      "Lost Reason",
      "Estimated Value",
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
        lead.contactName,
        lead.businessName,
        lead.email,
        lead.phone,
        formatEnumLabel(lead.source),
        lead.ownerName,
        lead.stageName,
        formatEnumLabel(lead.status),
        day(lead.createdAt),
        day(lead.lastContactAt),
        lead.nextAction,
        day(lead.nextFollowUpAt),
        day(lead.strategyCallAt),
        day(lead.proposalSentAt),
        day(lead.wonAt),
        day(lead.lostAt),
        lead.lostReasonCode ? formatEnumLabel(lead.lostReasonCode) : "",
        lead.proposalValue ?? lead.budgetAmount ?? "",
        lead.finalValue ?? "",
      ].map(cell).join(","),
    );

    const csv = [header.map(cell).join(","), ...rows].join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `exalted-leads-${new Date().toISOString().slice(0, 10)}.csv`;
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
            Turn prospects into paying clients. Track every lead, follow up, and opportunity.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canCreate ? (
            <Button size="md" onClick={() => setFormLeadId("new")}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              Add Lead
            </Button>
          ) : null}
          <Button variant="secondary" size="md" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
        </div>
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8">
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

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
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

          {/* Pipeline strip */}
          <Panel title="Sales Pipeline" subtitle="Click a stage to filter the list.">
            <div className="overflow-x-auto p-4">
              <div className="flex min-w-max items-stretch gap-1.5">
                {counts
                  .filter((stage) => !stage.isTerminal)
                  .map((stage, index, list) => (
                    <div key={stage.stageId} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          update("stageId", filters.stageId === stage.stageId ? "" : stage.stageId ?? "")
                        }
                        className={`w-[6.5rem] shrink-0 rounded-xl border p-2.5 text-center transition ${
                          filters.stageId === stage.stageId
                            ? "border-slate-950 bg-slate-50"
                            : "border-slate-200 hover:bg-slate-50/70"
                        }`}
                      >
                        <span className="block text-[11px] leading-4 text-slate-600">
                          {stage.name}
                        </span>
                        <span className="mt-1 block text-xl font-semibold text-slate-950">
                          {stage.count}
                        </span>
                      </button>
                      {index < list.length - 1 ? (
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                      ) : null}
                    </div>
                  ))}

                <div className="ml-2 flex items-stretch gap-1.5 border-l border-slate-200 pl-3">
                  {counts
                    .filter((stage) => stage.isTerminal)
                    .map((stage) => (
                      <button
                        key={stage.stageId}
                        type="button"
                        onClick={() =>
                          update("stageId", filters.stageId === stage.stageId ? "" : stage.stageId ?? "")
                        }
                        className={`w-[5.5rem] shrink-0 rounded-xl border p-2.5 text-center transition ${
                          filters.stageId === stage.stageId
                            ? "border-slate-950 bg-slate-50"
                            : "border-slate-200 hover:bg-slate-50/70"
                        }`}
                      >
                        <span className="block text-[11px] leading-4 text-slate-600">
                          {stage.name}
                        </span>
                        <span className="mt-1 block text-xl font-semibold text-slate-950">
                          {stage.count}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </Panel>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-10 pl-9 text-sm"
                placeholder="Search leads by name, email, phone, company…"
                value={filters.search}
                onChange={(event) => update("search", event.target.value)}
                aria-label="Search leads"
              />
            </div>

            <Button
              size="sm"
              variant="secondary"
              className="lg:hidden"
              onClick={() => setShowFilters((open) => !open)}
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              Filters
            </Button>

            <div
              className={`${showFilters ? "grid" : "hidden"} w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-1 lg:flex-wrap lg:items-center`}
            >
              <Select
                className="h-10 min-w-[9rem] flex-1 text-sm"
                value={filters.stageId}
                onChange={(event) => update("stageId", event.target.value)}
                aria-label="Stage"
              >
                <option value="">All Stages</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </Select>

              <Select
                className="h-10 min-w-[9rem] flex-1 text-sm"
                value={filters.ownerId}
                onChange={(event) => update("ownerId", event.target.value)}
                aria-label="Lead owner"
              >
                <option value="">All Owners</option>
                <option value="unassigned">Unassigned</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </Select>

              <Select
                className="h-10 min-w-[9rem] flex-1 text-sm"
                value={filters.source}
                onChange={(event) => update("source", event.target.value)}
                aria-label="Source"
              >
                <option value="">All Sources</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {formatEnumLabel(source)}
                  </option>
                ))}
              </Select>

              <Select
                className="h-10 min-w-[10rem] flex-1 text-sm"
                value={filters.sort}
                onChange={(event) => update("sort", event.target.value as SalesSort)}
                aria-label="Sort by"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            {hasActiveFilters(filters) ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFilters(EMPTY_SALES_FILTERS);
                  setPage(1);
                }}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>

          {/* Lead table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {visible.length === 0 ? (
              <div className="p-10 text-center">
                {leads.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-slate-900">No leads yet.</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Add your first lead or import your existing list.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-900">
                      No leads match these filters.
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Try changing the stage, range, owner, or source.
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      onClick={() => setFilters(EMPTY_SALES_FILTERS)}
                    >
                      Clear Filters
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[62rem] table-fixed text-left text-xs">
                    <colgroup>
                      <col className="w-[17%]" />
                      <col className="w-[13%]" />
                      <col className="w-[11%]" />
                      <col className="w-[12%]" />
                      <col className="w-[9%]" />
                      <col className="w-[16%]" />
                      <col className="w-[12%]" />
                      <col className="w-[7%]" />
                      <col className="w-[3rem]" />
                    </colgroup>
                    <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Lead</th>
                        <th className="px-3 py-2.5 font-semibold">Company</th>
                        <th className="px-3 py-2.5 font-semibold">Owner</th>
                        <th className="px-3 py-2.5 font-semibold">Stage</th>
                        <th className="px-3 py-2.5 font-semibold">Last Contact</th>
                        <th className="px-3 py-2.5 font-semibold">Next Action</th>
                        <th className="px-3 py-2.5 font-semibold">Next Follow Up</th>
                        <th className="px-3 py-2.5 font-semibold">Value</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visible.map((lead) => {
                        const due = followUpLabel(lead.nextFollowUpAt, now);
                        const age = proposalAgeDays(lead, now);

                        return (
                          <tr
                            key={lead.id}
                            className={`align-top transition hover:bg-slate-50/60 ${
                              openLeadId === lead.id ? "bg-sky-50/50" : ""
                            }`}
                          >
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setOpenLeadId(lead.id)}
                                className="text-left"
                              >
                                <span className="block break-words font-medium text-slate-900">
                                  {lead.contactName}
                                </span>
                                <span className="block truncate text-[11px] text-slate-500">
                                  {lead.email ?? lead.phone ?? "No contact details"}
                                </span>
                              </button>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              <span className="block truncate" title={lead.businessName}>
                                {lead.businessName}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-slate-600">
                              <span className="block truncate">
                                {lead.ownerName ?? "Unassigned"}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <Badge tone="slate" className="whitespace-nowrap">
                                {lead.stageName ?? formatEnumLabel(lead.status)}
                              </Badge>
                              {age !== null && age >= agingDays ? (
                                <p className="mt-1 whitespace-nowrap text-[11px] text-rose-600">
                                  {age} days waiting
                                </p>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                              {lastContactLabel(lead.lastContactAt, now)}
                            </td>
                            <td className="px-3 py-3 text-slate-700">
                              {lead.nextAction ? (
                                <span className="line-clamp-2" title={lead.nextAction}>
                                  {lead.nextAction}
                                </span>
                              ) : (
                                <span className="text-amber-600">Not set</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={`whitespace-nowrap ${
                                  due.tone === "overdue"
                                    ? "font-medium text-rose-600"
                                    : due.tone === "today" || due.tone === "soon"
                                      ? "text-amber-600"
                                      : due.tone === "none"
                                        ? "text-slate-400"
                                        : "text-slate-600"
                                }`}
                              >
                                {due.label}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                              {lead.finalValue ?? lead.proposalValue ?? lead.budgetAmount
                                ? money(
                                    lead.finalValue
                                    ?? lead.proposalValue
                                    ?? lead.budgetAmount
                                    ?? 0,
                                  )
                                : "—"}
                            </td>
                            <td className="px-3 py-3">
                              {/*
                                Only what this person may actually do. A greyed
                                out Convert on somebody else's lead just invites
                                a click that fails.
                              */}
                              <RowMenu
                                label={`Actions for ${lead.contactName}`}
                                items={[
                                  {
                                    label: "Open lead",
                                    onSelect: () => setOpenLeadId(lead.id),
                                  },
                                  ...(canEdit
                                    ? [
                                        {
                                          label: "Edit lead",
                                          onSelect: () => setFormLeadId(lead.id),
                                        },
                                      ]
                                    : []),
                                  ...(canConvert && !lead.convertedClientId && isOpen(lead)
                                    ? [
                                        {
                                          label: "Convert to client",
                                          onSelect: () => setConvertLeadId(lead.id),
                                        },
                                      ]
                                    : []),
                                  ...(lead.convertedClientId
                                    ? [
                                        {
                                          label: "Open client",
                                          href: `/clients/${lead.convertedClientId}`,
                                        },
                                      ]
                                    : []),
                                ]}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Cards below the table breakpoint. */}
                <ul className="divide-y divide-slate-100 md:hidden">
                  {visible.map((lead) => {
                    const due = followUpLabel(lead.nextFollowUpAt, now);

                    return (
                      <li key={lead.id} className="space-y-2 p-4">
                        <button
                          type="button"
                          onClick={() => setOpenLeadId(lead.id)}
                          className="block text-left"
                        >
                          <span className="block text-sm font-medium text-slate-900">
                            {lead.contactName}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {lead.businessName} · {lead.ownerName ?? "Unassigned"}
                          </span>
                        </button>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone="slate">{lead.stageName ?? formatEnumLabel(lead.status)}</Badge>
                          <Badge tone={due.tone === "overdue" ? "rose" : "amber"}>
                            {due.label}
                          </Badge>
                        </div>

                        <p className="text-xs text-slate-600">
                          <span className="font-medium text-slate-800">Next: </span>
                          {lead.nextAction ?? "Not set"}
                        </p>
                      </li>
                    );
                  })}
                </ul>

                {/* Pagination */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                  <p className="text-xs text-slate-600">
                    Showing {(currentPage - 1) * pageSize + 1} to{" "}
                    {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} leads
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-slate-600">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={currentPage === totalPages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </Button>
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
              </>
            )}
          </div>
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
                    <tr key={row.source}>
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
                  <li key={lead.id} className="flex items-start justify-between gap-2 p-3">
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
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {openLead ? (
        <LeadDrawer lead={openLead} now={now} onClose={() => setOpenLeadId(null)} />
      ) : null}

      {formLeadId ? (
        <LeadFormDialog
          lead={formLeadId === "new" ? null : (leads.find((row) => row.id === formLeadId) ?? null)}
          assignableUsers={owners}
          canAssign={canAssign}
          onClose={() => setFormLeadId(null)}
        />
      ) : null}

      {convertLead ? (
        <LeadConvertDialog
          lead={convertLead}
          assignableUsers={owners}
          canAssign={canAssign}
          onClose={() => setConvertLeadId(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * One lead, opened over the page.
 *
 * Read-only for now: every field it shows is one the table already carries, so
 * it costs no extra query. The actions that change a lead go through the
 * service, and are reached from the row menu.
 */
function LeadDrawer({
  lead,
  now,
  onClose,
}: {
  lead: SalesLead;
  now: Date;
  onClose: () => void;
}) {
  const due = followUpLabel(lead.nextFollowUpAt, now);

  const rows: { label: string; value: string }[] = [
    { label: "Company", value: lead.businessName },
    { label: "Email", value: lead.email ?? "—" },
    { label: "Phone", value: lead.phone ?? "—" },
    { label: "Source", value: formatEnumLabel(lead.source) },
    { label: "Owner", value: lead.ownerName ?? "Unassigned" },
    { label: "Stage", value: lead.stageName ?? formatEnumLabel(lead.status) },
    { label: "Status", value: formatEnumLabel(lead.status) },
    {
      label: "Estimated value",
      value:
        lead.finalValue ?? lead.proposalValue ?? lead.budgetAmount
          ? money(lead.finalValue ?? lead.proposalValue ?? lead.budgetAmount ?? 0)
          : "—",
    },
    { label: "Created", value: lead.createdAt.slice(0, 10) },
    { label: "Last contact", value: lastContactLabel(lead.lastContactAt, now) },
    { label: "Next action", value: lead.nextAction ?? "Not set" },
    { label: "Next follow up", value: due.label },
    {
      label: "Strategy call",
      value: lead.strategyCallAt
        ? `${lead.strategyCallAt.slice(0, 10)}${
            lead.strategyCallStatus ? ` · ${formatEnumLabel(lead.strategyCallStatus)}` : ""
          }`
        : "Not booked",
    },
    {
      label: "Proposal sent",
      value: lead.proposalSentAt ? lead.proposalSentAt.slice(0, 10) : "Not sent",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/40"
        onClick={onClose}
        aria-label="Close lead"
        tabIndex={-1}
      />
      <div className="relative flex max-h-full w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[min(44rem,90vh)] sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">{lead.contactName}</h2>
            <p className="text-xs text-slate-500">{lead.businessName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto p-4">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="shrink-0 text-xs text-slate-500">{row.label}</dt>
              <dd className="min-w-0 text-right text-xs font-medium text-slate-900">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        {lead.notes ? (
          <div className="border-t border-slate-100 p-4">
            <p className="text-xs font-semibold text-slate-900">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
              {lead.notes}
            </p>
          </div>
        ) : null}

        {lead.convertedClientId ? (
          <div className="border-t border-slate-100 p-3">
            <Link
              href={`/clients/${lead.convertedClientId}`}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              <Users className="h-3.5 w-3.5" />
              Open the client account
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
