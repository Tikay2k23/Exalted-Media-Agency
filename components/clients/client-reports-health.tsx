"use client";

/**
 * Clients -> open a client -> Reports & Health.
 *
 * The measurement layer. Everything here is read from a system that already
 * owns it - reports, optimizations, health assessments, strategy goals, the
 * renewal record - and aggregated by one derivation so the cards cannot
 * disagree with each other.
 *
 * Two cards say they have no data rather than filling their space, and that is
 * deliberate:
 *
 *   Performance Overview. There is no metrics store in this application.
 *     Nothing records a client's traffic, conversion rate, form submissions or
 *     response time over time, so the five rows and their sparklines would be
 *     drawings. The card explains the gap and points at what would close it.
 *
 *   Goal progress. Strategy goals carry their target as free text - "150
 *     qualified leads per month" - so there is no number to divide by. Each
 *     goal shows its state and why, without a percentage nobody measured.
 */

import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  FileText,
  Gauge,
  Info,
  Loader2,
  Plus,
  Target,
  TrendingUp,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Modal } from "@/components/journey/client/journey-dialogs";
import { TabLink } from "@/components/clients/client-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GOAL_STATE_LABELS,
  type GoalProgress,
  type HealthSummary,
  type OptimizationRow,
  type OptimizationSummary,
  type RenewalSummary,
  type ReportRow,
  type ReportingAction,
  type ReportSummary,
} from "@/lib/success/reports-health";
import { cn, formatEnumLabel } from "@/lib/utils";

import {
  CompleteOptimizationDialog,
  LogOptimizationDialog,
  PrepareReportDialog,
  ReportsDialog,
} from "@/components/clients/reports-dialogs";

/* -------------------------------------------------------------------------- */
/* Chrome                                                                     */
/* -------------------------------------------------------------------------- */

function Panel({
  icon: Icon,
  title,
  action,
  className,
  id,
  children,
}: {
  icon: typeof FileText;
  title: string;
  action?: React.ReactNode;
  className?: string;
  /* The anchor the summary tiles and the next-action button scroll to. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-950">
          <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="truncate">{title}</span>
        </h2>
        {action}
      </header>
      <div className="flex-1 p-4">{children}</div>
    </section>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-xs leading-5 text-slate-400">{children}</p>;
}

type Tone = "violet" | "amber" | "emerald" | "sky" | "rose";

const TILE_ICON: Record<Tone, string> = {
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  sky: "bg-sky-50 text-sky-600",
  rose: "bg-rose-50 text-rose-600",
};

const TILE_VALUE: Record<Tone, string> = {
  violet: "text-slate-950",
  amber: "text-amber-600",
  emerald: "text-emerald-600",
  sky: "text-sky-700",
  rose: "text-rose-600",
};

function Tile({
  icon: Icon,
  tone,
  label,
  value,
  caption,
  footer,
}: {
  icon: typeof FileText;
  tone: Tone;
  label: string;
  value: string;
  caption?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            TILE_ICON[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
          <p className={cn("truncate text-xl font-semibold leading-tight", TILE_VALUE[tone])}>
            {value}
          </p>
          {caption ? <div className="text-[11px] text-slate-500">{caption}</div> : null}
        </div>
      </div>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </div>
  );
}

function shortDate(iso: string | null) {
  if (!iso) return null;

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const REPORT_STATUS_TONE: Record<string, "slate" | "amber" | "emerald" | "sky" | "rose"> = {
  DRAFT: "slate",
  IN_REVIEW: "amber",
  APPROVED: "sky",
  SENT: "emerald",
  ACKNOWLEDGED: "emerald",
  LATE: "rose",
};

const GOAL_TONE: Record<string, "slate" | "amber" | "emerald" | "rose"> = {
  ACHIEVED: "emerald",
  ON_TRACK: "emerald",
  AT_RISK: "amber",
  BEHIND: "rose",
  NOT_STARTED: "slate",
  DROPPED: "slate",
};

/* -------------------------------------------------------------------------- */

export interface ReportsHealthProps {
  clientId: string;
  companyName: string;
  reports: ReportSummary;
  reportRows: ReportRow[];
  optimizations: OptimizationSummary;
  optimizationRows: OptimizationRow[];
  health: HealthSummary;
  goals: GoalProgress[];
  renewal: RenewalSummary;
  next: ReportingAction;
  owners: { id: string; name: string }[];
  reportTypes: { value: string; label: string }[];
  /** Open complaints, for the health card's context. */
  openComplaints: number;
  /**
   * The renewal and growth workspace, rendered whole when somebody opens it.
   *
   * A slot rather than a rebuild: it is the existing component with its
   * existing props, so opportunities, testimonials and referrals keep the one
   * implementation they already had. It used to stack under this page, which
   * is what made the tab read as the old design.
   */
  growthWorkspace: React.ReactNode;
  /*
   * The health workspace, for the same reason.
   *
   * Recording an assessment, raising a complaint and writing a recovery
   * plan have one implementation and it is this one. The card measures
   * health and opens the place that records it.
   */
  healthWorkspace: React.ReactNode;
  permissions: {
    canReport: boolean;
    canManageHealth: boolean;
    canViewFinance: boolean;
  };
}

export function ClientReportsHealth(props: ReportsHealthProps) {
  const { reports, optimizations, health, next, permissions } = props;
  const router = useRouter();
  const [dialog, setDialog] = useState<
    "prepare" | "reports" | "log" | "complete" | "growth" | "health" | null
  >(null);
  const [completing, setCompleting] = useState<OptimizationRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 600);
  }

  const dueTone: Tone =
    reports.next.state === "OVERDUE"
      ? "rose"
      : reports.next.state === "SOON"
        ? "amber"
        : "sky";

  return (
    <div className="space-y-4">
      {/* --------------------------------------------- four summary tiles -- */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={FileText}
          tone="violet"
          label="Monthly reports sent"
          value={String(reports.sentThisYear)}
          caption={
            <>
              This year
              {reports.changePercent !== null ? (
                <span
                  className={cn(
                    "ml-1.5 font-medium",
                    reports.changePercent >= 0 ? "text-emerald-600" : "text-rose-600",
                  )}
                >
                  {reports.changePercent >= 0 ? "↑" : "↓"} {Math.abs(reports.changePercent)}% vs
                  last year
                </span>
              ) : null}
            </>
          }
          footer={
            reports.delivered.length > 0 ? (
              <button
                type="button"
                onClick={() => setDialog("reports")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-800"
              >
                View sent reports
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </button>
            ) : null
          }
        />

        <Tile
          icon={Wrench}
          tone="amber"
          label="Open optimizations"
          value={String(optimizations.open.length)}
          caption={
            optimizations.open.length === 0
              ? "Nothing running"
              : `${optimizations.concluded.length} concluded to date`
          }
          footer={
            <a
              href="#optimization-log"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-800"
            >
              View optimizations
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </a>
          }
        />

        <Tile
          icon={Activity}
          tone={
            health.status === "AT_RISK" || health.status === "CRITICAL"
              ? "rose"
              : health.score === null
                ? "slate" as Tone
                : "emerald"
          }
          label="Account health"
          value={health.status ? formatEnumLabel(health.status) : "Not assessed"}
          caption={health.score !== null ? `Score: ${health.score} / 100` : "No assessment on file"}
          footer={
            <a
              href="#client-health"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-800"
            >
              View health details
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </a>
          }
        />

        <Tile
          icon={CalendarDays}
          tone={dueTone}
          label="Next report due"
          value={reports.next.label}
          caption={shortDate(reports.next.report?.dueAt ?? null) ?? "No report scheduled"}
          footer={
            permissions.canReport ? (
              <button
                type="button"
                onClick={() => setDialog("prepare")}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-800"
              >
                Prepare report
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </button>
            ) : null
          }
        />
      </div>

      {/* ------------------------------------------ the next thing to do -- */}
      {next.key !== "nothing" ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3",
            next.key === "report-overdue" || next.key === "health-poor"
              ? "border-rose-200 bg-rose-50"
              : "border-slate-200 bg-slate-50",
          )}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900">{next.title}</p>
            <p className="text-[11px] text-slate-600">{next.detail}</p>
          </div>
          {next.action ? (
            <Button
              type="button"
              size="sm"
              className="shrink-0"
              onClick={() => {
                if (next.action?.target === "report") setDialog("prepare");
                else if (next.action?.target === "optimizations")
                  document.getElementById("optimization-log")?.scrollIntoView({ block: "start" });
                else if (next.action?.target === "health")
                  document.getElementById("client-health")?.scrollIntoView({ block: "start" });
                else if (next.action?.target === "goals")
                  document.getElementById("goal-progress")?.scrollIntoView({ block: "start" });
                else document.getElementById("renewal-growth")?.scrollIntoView({ block: "start" });
              }}
            >
              {next.action.label}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* --------------------------------------------------- main reporting */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-3">
        <PerformancePanel />

        <ReportingHistoryPanel {...props} onPrepare={() => setDialog("prepare")} onAll={() => setDialog("reports")} />

        <OptimizationPanel
          {...props}
          onLog={() => setDialog("log")}
          onComplete={(row) => {
            setCompleting(row);
            setDialog("complete");
          }}
        />
      </div>

      {/* ------------------------------------------------------- lower row */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-3">
        <HealthPanel {...props} onOpenHealth={() => setDialog("health")} />
        <RenewalPanel {...props} onOpenGrowth={() => setDialog("growth")} />
        <GoalsPanel {...props} />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={refresh}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition hover:text-slate-700"
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {dialog === "prepare" ? (
        <PrepareReportDialog
          clientId={props.clientId}
          reportTypes={props.reportTypes}
          existing={props.reportRows}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "reports" ? (
        <ReportsDialog
          reports={props.reportRows}
          canManage={permissions.canReport}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "log" ? (
        <LogOptimizationDialog
          clientId={props.clientId}
          owners={props.owners}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "health" ? (
        <Modal
          eyebrow={props.companyName}
          title="Client health"
          onClose={() => setDialog(null)}
          footer={
            <Button type="button" size="sm" variant="secondary" onClick={() => setDialog(null)}>
              Close
            </Button>
          }
        >
          {props.healthWorkspace}
        </Modal>
      ) : null}

      {dialog === "growth" ? (
        <Modal
          eyebrow={props.companyName}
          title="Renewal & Growth"
          onClose={() => setDialog(null)}
          footer={
            <Button type="button" size="sm" variant="secondary" onClick={() => setDialog(null)}>
              Close
            </Button>
          }
        >
          {props.growthWorkspace}
        </Modal>
      ) : null}

      {dialog === "complete" && completing ? (
        <CompleteOptimizationDialog
          clientId={props.clientId}
          optimization={completing}
          onClose={() => {
            setCompleting(null);
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Panels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Performance, which this application does not record.
 *
 * The reference design shows leads, conversion rate, traffic, form submissions
 * and response time with sparklines. None of it exists: there is no table
 * anywhere holding a client's campaign metrics over time, and no integration
 * writing one. Rather than draw five plausible lines, the card says what is
 * missing and what would fill it.
 */
function PerformancePanel() {
  return (
    <Panel icon={TrendingUp} title="Performance Overview">
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-4">
        <p className="flex items-start gap-1.5 text-xs font-medium leading-5 text-slate-700">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          No performance metrics are recorded for this client.
        </p>
        <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
          Leads, conversion rate, traffic, form submissions and response time have no store in
          this application and no integration writing one. The figures would have to be invented,
          so the card shows nothing instead.
        </p>
        <p className="mt-2 text-[11px] leading-4 text-slate-500">
          What exists today: report history, optimizations and their outcomes, the recorded health
          assessment, and the strategy goals below.
        </p>
      </div>
    </Panel>
  );
}

function ReportingHistoryPanel({
  reportRows,
  permissions,
  onPrepare,
  onAll,
}: ReportsHealthProps & { onPrepare: () => void; onAll: () => void }) {
  const shown = [...reportRows]
    .sort((left, right) => Date.parse(right.periodEnd) - Date.parse(left.periodEnd))
    .slice(0, 5);

  return (
    <Panel
      icon={FileText}
      title="Reporting History"
      action={
        permissions.canReport ? (
          <Button type="button" size="sm" variant="secondary" onClick={onPrepare}>
            Prepare report
          </Button>
        ) : null
      }
    >
      {shown.length === 0 ? (
        <Quiet>No reports created yet.</Quiet>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[300px] text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                <th className="pb-1.5 font-medium">Report</th>
                <th className="pb-1.5 font-medium">Period</th>
                <th className="pb-1.5 font-medium">Status</th>
                <th className="pb-1.5 text-right font-medium">Sent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((row) => (
                <tr key={row.id} className="text-xs">
                  <td className="py-1.5 pr-2 text-slate-800">{formatEnumLabel(row.type)}</td>
                  <td className="py-1.5 pr-2 text-slate-500">
                    {new Date(row.periodStart).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                    {" - "}
                    {new Date(row.periodEnd).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="py-1.5 pr-2">
                    <Badge tone={REPORT_STATUS_TONE[row.status] ?? "slate"}>
                      {formatEnumLabel(row.status)}
                    </Badge>
                  </td>
                  <td className="py-1.5 text-right text-slate-500">
                    {shortDate(row.sentAt) ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reportRows.length > 0 ? (
        <button
          type="button"
          onClick={onAll}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
        >
          View all reports ({reportRows.length})
          <ArrowUpRight className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </Panel>
  );
}

function OptimizationPanel({
  optimizations,
  permissions,
  onLog,
  onComplete,
}: ReportsHealthProps & {
  onLog: () => void;
  onComplete: (row: OptimizationRow) => void;
}) {
  const shown = [...optimizations.open, ...optimizations.concluded].slice(0, 5);

  return (
    <Panel
      icon={Wrench}
      title="Optimization Log"
      id="optimization-log"
      className="scroll-mt-24"
      action={
        permissions.canReport ? (
          <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={onLog}>
            <Plus className="h-3 w-3" aria-hidden />
            Log
          </Button>
        ) : null
      }
    >
      {shown.length === 0 ? (
        <Quiet>No active optimizations.</Quiet>
      ) : (
        <ul className="space-y-2">
          {shown.map((row) => {
            const open = optimizations.open.some((entry) => entry.id === row.id);

            return (
              <li key={row.id} className="rounded-xl border border-slate-200 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-xs font-medium leading-4 text-slate-900">
                    {row.proposedChange}
                  </p>
                  <Badge tone={open ? "amber" : row.decision === "KEEP" ? "emerald" : "slate"}>
                    {open ? "Running" : formatEnumLabel(row.decision)}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{row.observedProblem}</p>
                {row.expectedMetric ? (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Expected: {row.expectedMetric}
                  </p>
                ) : null}
                {row.result ? (
                  <p className="mt-0.5 text-[11px] text-emerald-700">Actual: {row.result}</p>
                ) : null}

                {open && permissions.canReport ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-1.5 h-6 px-2 text-[11px]"
                    onClick={() => onComplete(row)}
                  >
                    Record result
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function HealthPanel({
  health,
  openComplaints,
  permissions,
  onOpenHealth,
}: ReportsHealthProps & { onOpenHealth: () => void }) {
  return (
    <Panel icon={Gauge} title="Client Health" id="client-health" className="scroll-mt-24">
      {health.score === null ? (
        <Quiet>Not enough information to calculate health yet.</Quiet>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4",
                health.score >= 80
                  ? "border-emerald-500 text-emerald-700"
                  : health.score >= 60
                    ? "border-amber-500 text-amber-700"
                    : "border-rose-500 text-rose-700",
              )}
            >
              <span className="text-lg font-semibold">{health.score}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">
                {formatEnumLabel(health.status ?? "")}
              </p>
              <p className="text-[11px] text-slate-500">
                Assessed {shortDate(health.assessedAt)}
                {health.stale ? " - out of date" : ""}
              </p>
            </div>
          </div>

          {health.strengths.length > 0 ? (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Key strengths</p>
              <ul className="mt-1 space-y-0.5">
                {health.strengths.map((item) => (
                  <li key={item} className="text-[11px] leading-4 text-emerald-700">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {health.risks.length > 0 ? (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Risks to monitor</p>
              <ul className="mt-1 space-y-0.5">
                {health.risks.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-1 text-[11px] leading-4 text-amber-700"
                  >
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {/*
        * This card measures; the workspace behind it records. Assessments,
        * complaints and recovery plans have one implementation and it opens
        * here - Journey shows the score it produces but cannot write one.
        */}
      <button
        type="button"
        onClick={onOpenHealth}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
      >
        {permissions.canManageHealth ? "Assess health" : "View assessment history"}
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      </button>

      {openComplaints > 0 ? (
        <p className="mt-1 text-[11px] text-rose-600">
          {openComplaints} open complaint{openComplaints === 1 ? "" : "s"} on this account.
        </p>
      ) : null}
    </Panel>
  );
}

function RenewalPanel({
  renewal,
  permissions,
  onOpenGrowth,
}: ReportsHealthProps & { onOpenGrowth: () => void }) {
  return (
    <Panel icon={CalendarDays} title="Renewal & Growth" id="renewal-growth" className="scroll-mt-24">
      {renewal.renewalDate === null ? (
        <Quiet>No renewal date configured.</Quiet>
      ) : (
        <dl className="divide-y divide-slate-100">
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-xs text-slate-500">Renewal date</dt>
            <dd className="text-xs font-medium text-slate-800">
              {shortDate(renewal.renewalDate)}
              {renewal.daysRemaining !== null ? (
                <span
                  className={cn(
                    "ml-1.5",
                    renewal.daysRemaining < 0
                      ? "text-rose-600"
                      : renewal.approaching
                        ? "text-amber-600"
                        : "text-slate-400",
                  )}
                >
                  ({renewal.daysRemaining < 0
                    ? `${Math.abs(renewal.daysRemaining)}d ago`
                    : `${renewal.daysRemaining}d`})
                </span>
              ) : null}
            </dd>
          </div>

          {permissions.canViewFinance && renewal.monthlyValue !== null ? (
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-xs text-slate-500">Monthly value</dt>
              <dd className="text-xs font-medium text-slate-800">
                ${renewal.monthlyValue.toLocaleString()}
              </dd>
            </div>
          ) : null}

          {renewal.contractMonths !== null ? (
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-xs text-slate-500">Contract term</dt>
              <dd className="text-xs font-medium text-slate-800">
                {renewal.contractMonths} months
              </dd>
            </div>
          ) : null}

          {renewal.stage ? (
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-xs text-slate-500">Renewal stage</dt>
              <dd className="text-xs font-medium text-slate-800">
                {formatEnumLabel(renewal.stage)}
              </dd>
            </div>
          ) : null}
        </dl>
      )}

      {/*
        * Growth opportunities, testimonials and referrals are managed on the
        * growth workspace under More. Recommending a service is a commercial
        * decision with its own record; this card says when the conversation is
        * due and sends somebody to the place that holds it.
        */}
      <button
        type="button"
        onClick={onOpenGrowth}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
      >
        View growth strategy
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      </button>
    </Panel>
  );
}

function GoalsPanel({ goals, clientId }: ReportsHealthProps) {
  return (
    <Panel icon={Target} title="Results / Goal Progress" id="goal-progress" className="scroll-mt-24">
      {goals.length === 0 ? (
        <Quiet>No measurable goals configured in Strategy.</Quiet>
      ) : (
        <ul className="space-y-2">
          {goals.slice(0, 5).map((entry) => (
            <li key={entry.goal.id} className="rounded-xl border border-slate-200 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-xs font-medium leading-4 text-slate-900">
                  {entry.goal.title}
                </p>
                <Badge tone={GOAL_TONE[entry.state] ?? "slate"}>
                  {GOAL_STATE_LABELS[entry.state]}
                </Badge>
              </div>

              {entry.goal.target ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Target: {entry.goal.target}
                  {entry.goal.metric ? ` ${entry.goal.metric}` : ""}
                </p>
              ) : null}

              <p className="mt-0.5 text-[11px] text-slate-400">{entry.reason}</p>
            </li>
          ))}
        </ul>
      )}

      {/*
        * Strategy defines, Reports measures. Editing a goal happens where it
        * was written, so there is one definition of what the client agreed to.
        */}
      <TabLink
        tab="services"
        clientId={clientId}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
      >
        Edit goals in Strategy
        <ArrowUpRight className="h-3 w-3" aria-hidden />
      </TabLink>

      {goals.length > 0 ? (
        <p className="mt-1.5 text-[10px] leading-4 text-slate-400">
          Goal targets are recorded as text, so progress is shown as a state and its reason rather
          than a percentage nobody measured.
        </p>
      ) : null}
    </Panel>
  );
}
