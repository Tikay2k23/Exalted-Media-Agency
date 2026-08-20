"use client";

import {
  AlertTriangle,
  CalendarClock,
  CircleAlert,
  Clock3,
  Columns3,
  Gauge,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  SlidersHorizontal,
  Smile,
  Table2,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { IconTile } from "@/components/journey/journey-bits";
import {
  JourneyHealthPanel,
  RecentActivityPanel,
  UpcomingMilestonesPanel,
} from "@/components/journey/journey-panels";
import { JourneyPipeline } from "@/components/journey/journey-pipeline";
import { JourneyTable } from "@/components/journey/journey-table";
import { Button } from "@/components/ui/button";
import type { JourneyWorkspaceData } from "@/lib/data/journey-queries";
import {
  type AttentionItem,
  EMPTY_JOURNEY_FILTERS,
  type JourneyAccount,
  type JourneyFilters,
  JOURNEY_SORTS,
  type JourneySort,
  LAUNCH_HORIZON_DAYS,
  RENEWAL_HORIZON_DAYS,
  type SummaryKey,
  activeFilterCount,
  applyJourneyFilters,
  attentionFeed,
  boardMetrics,
  groupByPhase,
  healthBreakdown,
  matchesSummary,
  sortJourneyAccounts,
  summaryCards,
  upcomingMilestones,
} from "@/lib/journey/journey-board";
import { cn, formatEnumLabel } from "@/lib/utils";

const SUMMARY_ICONS: Record<SummaryKey, typeof Users> = {
  active: Users,
  "on-track": TrendingUp,
  waiting: Clock3,
  "at-risk": AlertTriangle,
  "launching-soon": Rocket,
  "renewals-due": RefreshCw,
};

const SUMMARY_TONES: Record<SummaryKey, string> = {
  active: "bg-sky-50 text-sky-600",
  "on-track": "bg-emerald-50 text-emerald-600",
  waiting: "bg-amber-50 text-amber-600",
  "at-risk": "bg-rose-50 text-rose-600",
  "launching-soon": "bg-violet-50 text-violet-600",
  "renewals-due": "bg-cyan-50 text-cyan-600",
};

const ATTENTION_TONES: Record<AttentionItem["key"], string> = {
  blocker: "bg-rose-50 text-rose-600",
  "missing-access": "bg-amber-50 text-amber-600",
  "missing-assets": "bg-amber-50 text-amber-600",
  "approval-overdue": "bg-violet-50 text-violet-600",
  "stage-stalled": "bg-amber-50 text-amber-600",
  "milestone-overdue": "bg-rose-50 text-rose-600",
  "overdue-work": "bg-rose-50 text-rose-600",
  "client-quiet": "bg-slate-100 text-slate-600",
  "renewal-approaching": "bg-cyan-50 text-cyan-600",
  unowned: "bg-slate-100 text-slate-600",
};

function selectClass() {
  return "h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-400";
}

export function JourneyWorkspace({
  data,
  nowIso,
}: {
  data: JourneyWorkspaceData;
  nowIso: string;
}) {
  // Fixed for the lifetime of the render so the server and the client agree,
  // and so a card cannot say "Day 3" while the table beside it says "Day 4".
  const [now] = useState(() => new Date(nowIso));

  const [view, setView] = useState<"pipeline" | "table">("pipeline");
  const [filters, setFilters] = useState<JourneyFilters>(EMPTY_JOURNEY_FILTERS);
  const [sort, setSort] = useState<JourneySort>("needs-attention");
  const [summary, setSummary] = useState<SummaryKey | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAllAttention, setShowAllAttention] = useState(false);
  const router = useRouter();

  /*
   * Opening a client leaves the board.
   *
   * The client view is a full page rather than a drawer: it carries a header,
   * two columns of cards and a sidebar, none of which fits in a panel narrow
   * enough to keep the board visible behind it. The board itself is unchanged.
   */
  const openClient = (clientId: string) => router.push(`/journey/${clientId}`);

  const { accounts, stages, owners, services, activity } = data;

  const cards = useMemo(() => summaryCards(accounts, now), [accounts, now]);
  const health = useMemo(() => healthBreakdown(accounts, now), [accounts, now]);
  const metrics = useMemo(() => boardMetrics(accounts, now), [accounts, now]);
  const attention = useMemo(() => attentionFeed(accounts, now), [accounts, now]);
  const milestones = useMemo(() => upcomingMilestones(accounts, now, 6), [accounts, now]);

  const visible = useMemo(() => {
    const filtered = applyJourneyFilters(accounts, filters, now).filter((account) =>
      // The summary card's count and this predicate are the same function, so
      // clicking a card that reads 3 can never produce a board showing 5.
      summary === null ? true : matchesSummary(account, summary, now),
    );

    return sortJourneyAccounts(filtered, sort, now);
  }, [accounts, filters, summary, sort, now]);

  const columns = useMemo(() => groupByPhase(visible), [visible]);

  const shownAttention = showAllAttention ? attention : attention.slice(0, 4);
  const filterCount = activeFilterCount(filters);
  const activeHealthTotal = health.reduce((total, slice) => total + slice.value, 0);

  const patch = (next: Partial<JourneyFilters>) =>
    setFilters((current) => ({ ...current, ...next }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            Client Journey
          </h1>
          <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
            Track every client&apos;s delivery journey from onboarding to long-term
            growth.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition",
              showFilters || filterCount > 0
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            Filters
            {filterCount > 0 ? (
              <span className="rounded-full bg-white/20 px-1.5 text-[10px]">
                {filterCount}
              </span>
            ) : null}
          </button>
          <Link href="/clients">
            <Button size="sm" className="h-9 gap-1.5">
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add Client
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        {cards.map((card) => {
          const Icon = SUMMARY_ICONS[card.key];
          const isOn = summary === card.key;

          return (
            <button
              key={card.key}
              type="button"
              onClick={() => setSummary(isOn ? null : card.key)}
              aria-pressed={isOn}
              className={cn(
                "flex items-center gap-2.5 rounded-2xl border bg-white p-3 text-left transition",
                isOn
                  ? "border-slate-900 ring-1 ring-slate-900"
                  : "border-slate-200 hover:border-slate-300",
              )}
            >
              <IconTile className={SUMMARY_TONES[card.key]}>
                <Icon className="h-4 w-4" />
              </IconTile>
              <span className="min-w-0">
                <span className="block text-lg font-semibold leading-none text-slate-950">
                  {card.value}
                </span>
                <span className="mt-1 block truncate text-[11px] font-medium text-slate-600">
                  {card.label}
                </span>
                <span className="block truncate text-[10px] text-slate-400">
                  {card.caption}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Left column */}
        <div className="min-w-0 space-y-4">
          {/* Needs Attention */}
          {attention.length > 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white">
              <header className="flex items-center justify-between gap-2 px-4 pt-4">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
                  Needs Attention
                </h2>
                {attention.length > 4 ? (
                  <button
                    type="button"
                    onClick={() => setShowAllAttention((current) => !current)}
                    className="text-[11px] font-semibold text-slate-500 transition hover:text-slate-900"
                  >
                    {showAllAttention ? "Show less" : `View all (${attention.length})`}
                  </button>
                ) : null}
              </header>

              <div className="grid gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-4">
                {shownAttention.map((item) => (
                  <div
                    key={`${item.clientId}-${item.key}`}
                    className="flex min-w-0 flex-col rounded-xl border border-slate-200 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <IconTile className={cn("h-7 w-7", ATTENTION_TONES[item.key])}>
                        <CircleAlert className="h-3.5 w-3.5" />
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {item.companyName}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {item.stageName}
                        </p>
                      </div>
                    </div>

                    <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-600">
                      {item.problem}
                    </p>

                    {item.ageLabel ? (
                      <p className="mt-1 text-[10px] text-slate-400">
                        Outstanding {item.ageLabel}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => openClient(item.clientId)}
                      className="mt-3 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {item.action}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* Pipeline / Table */}
          <section className="min-w-0 rounded-2xl border border-slate-200 bg-white">
            <header className="px-4 pt-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Client Journey Pipeline
              </h2>
            </header>

            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="flex rounded-lg bg-slate-100 p-0.5">
                {(
                  [
                    { key: "pipeline", label: "Pipeline", Icon: Columns3 },
                    { key: "table", label: "Table", Icon: Table2 },
                  ] as const
                ).map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setView(key)}
                    aria-pressed={view === key}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition",
                      view === key
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>

              <label className="relative min-w-0 flex-1 sm:max-w-[13rem]">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  type="search"
                  value={filters.search}
                  onChange={(event) => patch({ search: event.target.value })}
                  placeholder="Search clients..."
                  aria-label="Search clients"
                  className="h-8 w-full rounded-lg border border-slate-200 pl-8 pr-2 text-xs outline-none transition focus:border-slate-400"
                />
              </label>

              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as JourneySort)}
                aria-label="Sort by"
                className={cn(selectClass(), "ml-auto")}
              >
                {JOURNEY_SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    Sort: {option.label}
                  </option>
                ))}
              </select>
            </div>

            {showFilters ? (
              <div className="grid gap-2 border-y border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2 xl:grid-cols-5">
                <select
                  value={filters.stageId}
                  onChange={(event) => patch({ stageId: event.target.value })}
                  aria-label="Stage"
                  className={selectClass()}
                >
                  <option value="">All stages</option>
                  {stages
                    .filter((stage) => !stage.isDeprecated)
                    .map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                </select>

                <select
                  value={filters.ownerId}
                  onChange={(event) => patch({ ownerId: event.target.value })}
                  aria-label="Project manager"
                  className={selectClass()}
                >
                  <option value="">All managers</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.health}
                  onChange={(event) =>
                    patch({ health: event.target.value as JourneyFilters["health"] })
                  }
                  aria-label="Health"
                  className={selectClass()}
                >
                  <option value="">All health</option>
                  <option value="ON_TRACK">On Track</option>
                  <option value="WAITING">Waiting</option>
                  <option value="AT_RISK">At Risk</option>
                  <option value="BLOCKED">Blocked</option>
                </select>

                <select
                  value={filters.service}
                  onChange={(event) => patch({ service: event.target.value })}
                  aria-label="Service"
                  className={selectClass()}
                >
                  <option value="">All services</option>
                  {services.map((service) => (
                    <option key={service} value={service}>
                      {formatEnumLabel(service)}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <select
                    value={filters.launchWithinDays ?? ""}
                    onChange={(event) =>
                      patch({
                        launchWithinDays: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                    aria-label="Launch date"
                    className={cn(selectClass(), "min-w-0 flex-1")}
                  >
                    <option value="">Any launch</option>
                    <option value={LAUNCH_HORIZON_DAYS}>
                      Launch within {LAUNCH_HORIZON_DAYS}d
                    </option>
                    <option value="30">Launch within 30d</option>
                  </select>

                  <select
                    value={filters.renewalWithinDays ?? ""}
                    onChange={(event) =>
                      patch({
                        renewalWithinDays: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                    aria-label="Renewal due"
                    className={cn(selectClass(), "min-w-0 flex-1")}
                  >
                    <option value="">Any renewal</option>
                    <option value={RENEWAL_HORIZON_DAYS}>
                      Renewal within {RENEWAL_HORIZON_DAYS}d
                    </option>
                    <option value="90">Renewal within 90d</option>
                  </select>
                </div>

                {filterCount > 0 || summary !== null ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFilters(EMPTY_JOURNEY_FILTERS);
                      setSummary(null);
                    }}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 sm:col-span-2 xl:col-span-1"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className={cn(view === "pipeline" ? "p-3" : "pb-1")}>
              {view === "pipeline" ? (
                accounts.length === 0 ? (
                  <p className="px-4 py-12 text-center text-sm text-slate-500">
                    No clients are in the journey yet. They appear here as soon as a
                    lead is converted.
                  </p>
                ) : (
                  <JourneyPipeline
                    columns={columns}
                    now={now}
                    onOpen={(account) => openClient(account.id)}
                  />
                )
              ) : (
                <JourneyTable
                  accounts={visible}
                  now={now}
                  onOpen={(account: JourneyAccount) => openClient(account.id)}
                />
              )}
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="min-w-0 space-y-4">
          <JourneyHealthPanel slices={health} total={activeHealthTotal} />
          <UpcomingMilestonesPanel
            milestones={milestones}
            onOpenClient={(clientId) => openClient(clientId)}
          />
          <RecentActivityPanel
            entries={activity}
            now={now}
            onOpenClient={(clientId) => openClient(clientId)}
          />
        </div>
      </div>

      {/* Bottom metrics */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
        {[
          {
            label: "Avg. Days in Stage",
            value: `${metrics.avgDaysInStage}`,
            caption: `Across ${metrics.activeCount} active client${
              metrics.activeCount === 1 ? "" : "s"
            }`,
            Icon: Clock3,
            tone: "text-sky-600",
          },
          {
            label: "On-Time Progress",
            value: `${metrics.onTimePercent}%`,
            caption: `${metrics.onTimeCount} inside stage target`,
            Icon: Gauge,
            tone: "text-emerald-600",
          },
          {
            label: "Completed Milestones",
            value: `${metrics.completedMilestonesThisMonth}`,
            caption: "This month",
            Icon: CalendarClock,
            tone: "text-violet-600",
          },
          {
            label: "At Risk Clients",
            value: `${metrics.atRiskCount}`,
            caption:
              metrics.atRiskCount > 0 ? "Needs immediate attention" : "Nothing at risk",
            Icon: AlertTriangle,
            tone: metrics.atRiskCount > 0 ? "text-rose-600" : "text-slate-400",
          },
          {
            label: "Client Satisfaction",
            value: metrics.satisfaction === null ? "-" : `${metrics.satisfaction} / 5`,
            caption:
              metrics.satisfactionResponses === 0
                ? "No scores recorded yet"
                : `From ${metrics.satisfactionResponses} assessment${
                    metrics.satisfactionResponses === 1 ? "" : "s"
                  }`,
            Icon: Smile,
            tone: "text-amber-600",
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-2xl border border-slate-200 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium text-slate-500">{tile.label}</p>
              <tile.Icon className={cn("h-3.5 w-3.5 shrink-0", tile.tone)} aria-hidden />
            </div>
            <p className="mt-1.5 text-lg font-semibold leading-none text-slate-950">
              {tile.value}
            </p>
            <p className="mt-1 truncate text-[10px] text-slate-400">{tile.caption}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
