"use client";

import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Columns3,
  Download,
  Filter,
  RefreshCw,
  Search,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  HealthBadge,
  MilestoneText,
  Monogram,
  OwnerChip,
  StageBadge,
  WaitingBadge,
  EmptyPanel,
} from "@/components/clients/client-bits";
import { RowMenu, type RowMenuItem } from "@/components/work/row-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  CLIENT_SORTS,
  EMPTY_CLIENT_FILTERS,
  HEALTH_LABELS,
  advancedFilterCount,
  applyClientFilters,
  attentionReasons,
  hasActiveFilters,
  healthFromStatus,
  isWaitingOnClient,
  milestoneDayLabel,
  milestoneFeed,
  nextMilestone,
  quickFilterChips,
  relativeTime,
  SUMMARY_FILTER,
  serviceLabel,
  summaryCards,
  type ClientFilters,
  type ClientHealth,
  type ClientRow,
  type ClientSort,
  type SummaryKey,
} from "@/lib/clients/client-workspace";
import type { ClientStageOption } from "@/lib/data/clients-dashboard-query";
import { formatEnumLabel } from "@/lib/utils";

const SUMMARY_ICONS: Record<SummaryKey, LucideIcon> = {
  active: Users,
  "needs-attention": AlertTriangle,
  "waiting-on-client": Clock,
  "renewals-soon": RefreshCw,
  "open-work": CheckCircle2,
};

const SUMMARY_TONES: Record<SummaryKey, string> = {
  active: "bg-violet-50 text-violet-600",
  "needs-attention": "bg-amber-50 text-amber-600",
  "waiting-on-client": "bg-sky-50 text-sky-600",
  "renewals-soon": "bg-emerald-50 text-emerald-600",
  "open-work": "bg-indigo-50 text-indigo-600",
};

const PAGE_SIZES = [10, 25, 50];

/** Columns somebody may switch off. Client and Action always stay. */
const OPTIONAL_COLUMNS = [
  { key: "service", label: "Service" },
  { key: "owner", label: "Owner" },
  { key: "stage", label: "Stage" },
  { key: "health", label: "Health" },
  { key: "milestone", label: "Next Milestone" },
  { key: "work", label: "Open Work" },
  { key: "activity", label: "Last Activity" },
] as const;

type ColumnKey = (typeof OPTIONAL_COLUMNS)[number]["key"];

/**
 * How wide each column is.
 *
 * Percentages rather than content-driven widths, because a table that resizes
 * its columns around whichever client happens to have the longest stage name
 * looks different on every page of results.
 */
const COLUMN_WIDTHS: Record<ColumnKey | "client" | "action", string> = {
  client: "w-[17%]",
  service: "w-[11%]",
  owner: "w-[12%]",
  stage: "w-[14%]",
  health: "w-[10%]",
  milestone: "w-[16%]",
  work: "w-[8%]",
  activity: "w-[12%]",
  action: "w-[10rem]",
};

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
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * The Clients dashboard.
 *
 * Built around the three questions somebody opens it to answer: which accounts
 * need attention, what is coming up, and how do I find one. Everything on the
 * page is derived in the browser from the rows the server sent, so a card that
 * says four always filters to four.
 *
 * There is deliberately no pipeline overview here. Journey is where the
 * delivery pipeline lives, and a second picture of it on this page would be a
 * copy that quietly disagrees with the original.
 */
export function ClientsDashboard({
  clients,
  stages,
  owners,
  services,
  canManage,
  serverNow,
  addClientAction,
}: {
  clients: ClientRow[];
  stages: ClientStageOption[];
  owners: { id: string; name: string }[];
  services: string[];
  canManage: boolean;
  serverNow: string;
  /** The existing Add Client wizard, passed in rather than rebuilt. */
  addClientAction: React.ReactNode;
}) {
  const [filters, setFilters] = useState<ClientFilters>(EMPTY_CLIENT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [hidden, setHidden] = useState<Set<ColumnKey>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const now = useMemo(() => new Date(serverNow), [serverNow]);

  const cards = useMemo(() => summaryCards(clients, now), [clients, now]);
  const chips = useMemo(() => quickFilterChips(clients, now), [clients, now]);
  const milestones = useMemo(() => milestoneFeed(clients, now, 6), [clients, now]);

  const attention = useMemo(
    () =>
      clients
        .map((client) => ({ client, reasons: attentionReasons(client, now) }))
        .filter((entry) => entry.reasons.length > 0)
        .sort(
          (a, b) =>
            b.reasons.reduce((sum, r) => sum + r.weight, 0)
            - a.reasons.reduce((sum, r) => sum + r.weight, 0),
        ),
    [clients, now],
  );

  const filtered = useMemo(
    () => applyClientFilters(clients, filters, now),
    [clients, filters, now],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const advanced = advancedFilterCount(filters);

  function update<K extends keyof ClientFilters>(key: K, value: ClientFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function shows(key: ColumnKey) {
    return !hidden.has(key);
  }

  /** Only the actions this person may actually take. */
  function menuItemsFor(client: ClientRow): RowMenuItem[] {
    return [
      { label: "Open client", href: `/clients/${client.id}` },
      { label: "Tasks and delivery", href: `/clients/${client.id}?tab=tasks` },
      { label: "Files and access", href: `/clients/${client.id}?tab=files` },
      { label: "Activity and notes", href: `/clients/${client.id}?tab=activity` },
      ...(canManage
        ? [
            { label: "Edit account", href: `/clients/${client.id}?tab=contacts` },
            { label: "QA and approvals", href: `/clients/${client.id}?tab=quality` },
            { label: "Reports and health", href: `/clients/${client.id}?tab=reports` },
          ]
        : []),
    ];
  }

  function exportCsv() {
    const header = [
      "Client",
      "Primary Contact",
      "Email",
      "Phone",
      "Service",
      "Owner",
      "Stage",
      "Health",
      "Status",
      "Waiting on Client",
      "Next Milestone",
      "Milestone Due",
      "Open Work",
      "Overdue Work",
      "Renewal Date",
      "Last Activity",
    ];

    const cell = (value: string | number | null) => {
      const text = value === null || value === undefined ? "" : String(value);
      // A leading =, + or - would be run as a formula when the file is opened.
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""').replaceAll(/\r?\n/g, " ")}"`;
    };

    const rows = filtered.map((client) => {
      const next = nextMilestone(client, now);

      return [
        client.companyName,
        client.clientName,
        client.contactEmail,
        client.contactPhone,
        serviceLabel(client),
        client.ownerName,
        client.stageName,
        // Through the same function the badge uses, so the export and the
        // screen can never disagree about an account's health.
        HEALTH_LABELS[
          healthFromStatus(client.healthStatus, {
            hasBlocker: Boolean(client.currentBlocker?.trim()),
          })
        ],
        formatEnumLabel(client.status),
        isWaitingOnClient(client) ? "Yes" : "No",
        next?.name ?? "",
        next ? next.dueAt.slice(0, 10) : "",
        client.openTaskCount,
        client.overdueTaskCount,
        client.renewalDate ? client.renewalDate.slice(0, 10) : "",
        client.lastActivityAt ? client.lastActivityAt.slice(0, 10) : "",
      ]
        .map(cell)
        .join(",");
    });

    const csv = [header.map(cell).join(","), ...rows].join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `exalted-clients-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
            Clients Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage active accounts, delivery progress, and anything requiring attention.
          </p>
        </div>

        {/*
          Search takes its own row on a phone. Sharing one with two buttons at
          343px left it about 120px wide, which is not a search field.
        */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full sm:w-auto sm:min-w-[14rem]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-9 w-full pl-9 text-sm"
              placeholder="Search clients…"
              value={filters.search}
              onChange={(event) => update("search", event.target.value)}
              aria-label="Search clients"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export CSV
            </Button>
            {addClientAction}
          </div>
        </div>
      </div>

      {/* Summary cards. Each one filters the directory below. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => {
          const Icon = SUMMARY_ICONS[card.key];
          // The filter a card applies is the predicate that produced its count,
          // so clicking one always lands on exactly the rows it counted.
          const quick = SUMMARY_FILTER[card.key];
          const isOn = filters.quick === quick;

          return (
            <button
              key={card.key}
              type="button"
              onClick={() => update("quick", filters.quick === quick ? "all" : quick)}
              className={`flex min-h-[5.5rem] items-start gap-2.5 rounded-xl border p-3.5 text-left transition ${
                isOn ? "border-slate-950 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50/70"
              }`}
            >
              <span className={`shrink-0 rounded-xl p-2.5 ${SUMMARY_TONES[card.key]}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-600">
                  {card.label}
                </span>
                <span className="mt-0.5 block text-2xl font-semibold leading-8 text-slate-950">
                  {card.value}
                </span>
                <span
                  className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${
                    quick === "all" ? "text-slate-400" : "text-sky-600"
                  }`}
                >
                  {quick === "all" ? card.hint : "View list"}
                  {quick === "all" ? null : <ArrowRight className="h-3 w-3" />}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Attention and what is coming up. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
        <Panel
          title="Clients Needing Attention"
          subtitle="Worst first. Each reason opens the tab that can fix it."
          action={
            attention.length > 3 ? (
              <button
                type="button"
                onClick={() => update("quick", "needs-attention")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-700"
              >
                View all ({attention.length})
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null
          }
        >
          {attention.length === 0 ? (
            <div className="p-4">
              <EmptyPanel>Nothing needs attention right now.</EmptyPanel>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {attention.slice(0, 4).map(({ client, reasons }) => {
                const next = nextMilestone(client, now);

                return (
                  /*
                   * A grid rather than flex-wrap. Every row has the same four
                   * columns at the same widths, so the milestone and the
                   * buttons line up down the panel instead of each row finding
                   * its own position based on how much text is above it.
                   */
                  <li
                    key={client.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_11rem_auto]"
                  >
                    <Monogram name={client.companyName} size="md" square />

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/clients/${client.id}`}
                          className="truncate text-sm font-semibold text-slate-900 hover:text-sky-700"
                        >
                          {client.companyName}
                        </Link>
                        <HealthBadge client={client} />
                        {isWaitingOnClient(client) ? <WaitingBadge /> : null}
                      </div>

                      <p className="truncate text-[11px] text-slate-500">{client.clientName}</p>

                      {/*
                        One line, separated by dots. Wrapping these onto their
                        own rows made every entry a different height, which is
                        what stopped the panel scanning cleanly.
                      */}
                      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] text-slate-600">
                        {reasons.slice(0, 3).map((reason, index) => (
                          <span key={reason.key} className="flex min-w-0 items-center gap-1.5">
                            {index > 0 ? (
                              <span className="shrink-0 text-slate-300">·</span>
                            ) : null}
                            {/*
                              truncate belongs on the link, not the paragraph.
                              On a flex container it only hard-clips - the items
                              are laid out first and then cut, so at 364px the
                              third reason was chopped mid-word with no ellipsis
                              and 54px of it sat outside the card. Each item
                              shrinking and ellipsising keeps the one-line shape
                              the row is built around.
                            */}
                            <Link
                              href={`/clients/${client.id}?tab=${reason.tab}`}
                              className="truncate underline-offset-2 hover:text-sky-700 hover:underline"
                            >
                              {reason.label}
                            </Link>
                          </span>
                        ))}
                      </p>
                    </div>

                    <div className="col-start-2 text-[11px] sm:col-start-3">
                      <p className="text-slate-400">Next milestone</p>
                      <MilestoneText milestone={next} now={now} />
                    </div>

                    <div className="col-start-2 flex items-center gap-1.5 justify-self-start sm:col-start-4 sm:justify-self-end">
                      <Link
                        href={`/clients/${client.id}`}
                        className="whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Open Client
                      </Link>
                      <RowMenu
                        label={`Actions for ${client.companyName}`}
                        items={menuItemsFor(client)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Upcoming Milestones" subtitle="Across every account you can see.">
          {milestones.length === 0 ? (
            <div className="p-4">
              <EmptyPanel>Nothing scheduled on any account.</EmptyPanel>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {milestones.map((milestone) => {
                const at = new Date(milestone.dueAt);

                return (
                  <li key={`${milestone.source}-${milestone.id}`}>
                    <Link
                      href={`/clients/${milestone.clientId}?tab=${milestone.tab}`}
                      className="flex items-start gap-3 p-3 transition hover:bg-slate-50"
                    >
                      <span className="w-[4.5rem] shrink-0">
                        <span className="block text-[11px] font-semibold text-slate-700">
                          {milestoneDayLabel(milestone.dueAt, now)}
                        </span>
                        <span className="block text-[10px] uppercase tracking-wide text-slate-400">
                          {at.toLocaleDateString(undefined, {
                            weekday: "short",
                          })}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-900">
                          {milestone.clientName}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {milestone.name}
                        </span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400">
                        {milestone.hasTime
                          ? at.toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "All day"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* The directory. This table lives here and nowhere else. */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => update("quick", chip.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                filters.quick === chip.key
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {chip.label}
              {chip.count > 0 ? (
                <span
                  className={`rounded-full px-1.5 text-[10px] font-semibold ${
                    filters.quick === chip.key ? "bg-white/20" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {chip.count}
                </span>
              ) : null}
            </button>
          ))}

          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <Button
              size="sm"
              variant={showFilters || advanced ? "secondary" : "ghost"}
              onClick={() => setShowFilters((open) => !open)}
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              Filter
              {advanced ? (
                <span className="ml-1.5 rounded-full bg-slate-900 px-1.5 text-[10px] font-semibold text-white">
                  {advanced}
                </span>
              ) : null}
            </Button>

            <Button
              size="sm"
              variant={showColumns ? "secondary" : "ghost"}
              onClick={() => setShowColumns((open) => !open)}
            >
              <Columns3 className="mr-1.5 h-3.5 w-3.5" />
              Columns
            </Button>

            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
              <Select
                className="h-9 min-w-[11rem] text-xs"
                value={filters.sort}
                onChange={(event) => update("sort", event.target.value as ClientSort)}
                aria-label="Sort clients"
              >
                {CLIENT_SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    Sort: {option.label}
                  </option>
                ))}
              </Select>
            </div>

            {hasActiveFilters(filters) ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFilters(EMPTY_CLIENT_FILTERS);
                  setPage(1);
                }}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {showFilters ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 border-b border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              className="h-9 text-xs"
              value={filters.ownerId}
              onChange={(event) => update("ownerId", event.target.value)}
              aria-label="Account owner"
            >
              <option value="">All owners</option>
              <option value="unassigned">Unassigned</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </Select>

            <Select
              className="h-9 text-xs"
              value={filters.stageId}
              onChange={(event) => update("stageId", event.target.value)}
              aria-label="Client stage"
            >
              <option value="">All stages</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>

            <Select
              className="h-9 text-xs"
              value={filters.health}
              onChange={(event) => update("health", event.target.value)}
              aria-label="Client health"
            >
              <option value="">All health</option>
              {(Object.keys(HEALTH_LABELS) as ClientHealth[]).map((health) => (
                <option key={health} value={health}>
                  {HEALTH_LABELS[health]}
                </option>
              ))}
            </Select>

            <Select
              className="h-9 text-xs"
              value={filters.service}
              onChange={(event) => update("service", event.target.value)}
              aria-label="Service"
            >
              <option value="">All services</option>
              {services.map((service) => (
                <option key={service} value={service}>
                  {formatEnumLabel(service)}
                </option>
              ))}
            </Select>

            <Select
              className="h-9 text-xs"
              value={filters.status}
              onChange={(event) => update("status", event.target.value)}
              aria-label="Account status"
            >
              <option value="">All statuses</option>
              {["ACTIVE", "AT_RISK", "ON_HOLD", "COMPLETED"].map((status) => (
                <option key={status} value={status}>
                  {formatEnumLabel(status)}
                </option>
              ))}
            </Select>

            {/*
              Kept apart from health on purpose. An account can be perfectly
              healthy and still be waiting on a login.
            */}
            <Select
              className="h-9 text-xs"
              value={filters.waiting}
              onChange={(event) => update("waiting", event.target.value as "" | "yes" | "no")}
              aria-label="Waiting on client"
            >
              <option value="">Waiting on client: any</option>
              <option value="yes">Waiting on client</option>
              <option value="no">Not waiting on client</option>
            </Select>

            <Select
              className="h-9 text-xs"
              value={filters.renewal}
              onChange={(event) => update("renewal", event.target.value as "" | "soon" | "later")}
              aria-label="Renewal status"
            >
              <option value="">Renewal: any</option>
              <option value="soon">Renewal due soon</option>
              <option value="later">Not due soon</option>
            </Select>

            <Select
              className="h-9 text-xs"
              value={filters.work}
              onChange={(event) =>
                update("work", event.target.value as "" | "open" | "overdue" | "none")
              }
              aria-label="Work"
            >
              <option value="">Work: any</option>
              <option value="open">Has open work</option>
              <option value="overdue">Has overdue work</option>
              <option value="none">No open work</option>
            </Select>
          </div>
        ) : null}

        {showColumns ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50/60 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Show columns
            </span>
            {OPTIONAL_COLUMNS.map((column) => (
              <label key={column.key} className="flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={shows(column.key)}
                  onChange={() =>
                    setHidden((current) => {
                      const next = new Set(current);
                      // Hiding a column hides it. The data stays on the row and
                      // in the export.
                      if (next.has(column.key)) next.delete(column.key);
                      else next.add(column.key);
                      return next;
                    })
                  }
                  className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
                />
                {column.label}
              </label>
            ))}
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            {clients.length === 0 ? (
              <>
                <p className="text-sm font-medium text-slate-900">No client accounts yet.</p>
                <p className="mt-1 text-sm text-slate-600">
                  Add one, or win an opportunity in Sales and hand it over.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-900">
                  No clients match these filters.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => setFilters(EMPTY_CLIENT_FILTERS)}
                >
                  Clear filters
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full table-fixed text-left text-xs">
                {/*
                  table-fixed without a colgroup gives every column an equal
                  share, which is what left a long stage name truncating
                  mid-word while Health sat in a column twice the width it
                  needed. The widths are declared here and rebuilt from
                  whichever columns are switched on, so hiding one redistributes
                  the space rather than breaking the alignment.
                */}
                <colgroup>
                  <col className={COLUMN_WIDTHS.client} />
                  {OPTIONAL_COLUMNS.filter((column) => shows(column.key)).map((column) => (
                    <col key={column.key} className={COLUMN_WIDTHS[column.key]} />
                  ))}
                  <col className={COLUMN_WIDTHS.action} />
                </colgroup>
                <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Client</th>
                    {shows("service") ? (
                      <th className="px-3 py-2.5 font-semibold">Service</th>
                    ) : null}
                    {shows("owner") ? (
                      <th className="px-3 py-2.5 font-semibold">Owner</th>
                    ) : null}
                    {shows("stage") ? (
                      <th className="px-3 py-2.5 font-semibold">Stage</th>
                    ) : null}
                    {shows("health") ? (
                      <th className="px-3 py-2.5 font-semibold">Health</th>
                    ) : null}
                    {shows("milestone") ? (
                      <th className="px-3 py-2.5 font-semibold">Next Milestone</th>
                    ) : null}
                    {shows("work") ? (
                      <th className="px-3 py-2.5 font-semibold">Open Work</th>
                    ) : null}
                    {shows("activity") ? (
                      <th className="px-3 py-2.5 font-semibold">Last Activity</th>
                    ) : null}
                    <th className="px-3 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((client) => (
                    <tr key={client.id} className="align-top transition hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <Monogram name={client.companyName} size="md" square />
                          <div className="min-w-0">
                            <Link
                              href={`/clients/${client.id}`}
                              className="block break-words font-medium text-slate-900 hover:text-sky-700"
                            >
                              {client.companyName}
                            </Link>
                            <span className="block truncate text-[11px] text-slate-500">
                              {client.clientName}
                            </span>
                          </div>
                        </div>
                      </td>

                      {shows("service") ? (
                        <td className="px-3 py-3 text-slate-600">
                          <span className="block truncate">{serviceLabel(client)}</span>
                        </td>
                      ) : null}

                      {shows("owner") ? (
                        <td className="px-3 py-3">
                          <OwnerChip name={client.ownerName} />
                        </td>
                      ) : null}

                      {shows("stage") ? (
                        <td className="px-3 py-3">
                          <StageBadge name={client.stageName} />
                        </td>
                      ) : null}

                      {shows("health") ? (
                        <td className="px-3 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <HealthBadge client={client} />
                            {isWaitingOnClient(client) ? <WaitingBadge /> : null}
                          </div>
                        </td>
                      ) : null}

                      {shows("milestone") ? (
                        <td className="px-3 py-3">
                          <MilestoneText milestone={nextMilestone(client, now)} now={now} />
                        </td>
                      ) : null}

                      {shows("work") ? (
                        <td className="whitespace-nowrap px-3 py-3">
                          <span className="block text-slate-700">
                            {client.openTaskCount} open
                          </span>
                          <span
                            className={`block text-[11px] ${
                              client.overdueTaskCount > 0 ? "text-rose-600" : "text-slate-400"
                            }`}
                          >
                            {client.overdueTaskCount} overdue
                          </span>
                        </td>
                      ) : null}

                      {shows("activity") ? (
                        <td className="px-3 py-3">
                          <span className="block whitespace-nowrap text-slate-600">
                            {relativeTime(client.lastActivityAt, now)}
                          </span>
                          <span className="block truncate text-[11px] text-slate-400">
                            {client.lastActivityLabel ?? "No recorded activity"}
                          </span>
                        </td>
                      ) : null}

                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/clients/${client.id}`}
                            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Open Client
                          </Link>
                          <RowMenu
                            label={`Actions for ${client.companyName}`}
                            items={menuItemsFor(client)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cards below the table breakpoint. */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {visible.map((client) => (
                <li key={client.id} className="space-y-2 p-4">
                  <div className="flex items-start gap-2">
                    <Monogram name={client.companyName} size="md" square />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/clients/${client.id}`}
                        className="block text-sm font-medium text-slate-900"
                      >
                        {client.companyName}
                      </Link>
                      <span className="block truncate text-xs text-slate-500">
                        {client.clientName} · {serviceLabel(client)}
                      </span>
                    </div>
                    <RowMenu
                      label={`Actions for ${client.companyName}`}
                      items={menuItemsFor(client)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <StageBadge name={client.stageName} />
                    <HealthBadge client={client} />
                    {isWaitingOnClient(client) ? <WaitingBadge /> : null}
                  </div>

                  <p className="text-xs text-slate-600">
                    {client.openTaskCount} open · {client.overdueTaskCount} overdue ·{" "}
                    {relativeTime(client.lastActivityAt, now)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-600">
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} clients
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
                      {size} / page
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
