"use client";

/**
 * Clients -> open a client -> Approvals.
 *
 * The four systems behind this page already existed and already worked: QA
 * plans, defects, sign-off records and launch checklists. What they did not do
 * was add up. Each card was honest on its own and the page never answered the
 * only question anybody opens it to ask - can this go out, and if not, what is
 * stopping it.
 *
 * So every figure here comes from one derivation, approvalGate, computed on
 * the server from those same rows. The cards are views of one answer rather
 * than four independent readings, which is what stops 65% QA appearing beside
 * a green launch light.
 *
 * The layout is fixed by the design and deliberately preserved: four summary
 * tiles, a four-column band, then the lower band. What changed is that the
 * numbers are real, the state drives which actions appear, and every button
 * either does something or is not drawn.
 */

import {
  Activity,
  BadgeCheck,
  Bug,
  CircleCheck,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Loader2,
  Rocket,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  DefectsDialog,
  LaunchChecklistDialog,
  QaChecklistDialog,
  RaiseDefectDialog,
  RecordApprovalDialog,
} from "@/components/clients/approval-dialogs";
import { TabLink } from "@/components/clients/client-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  APPROVAL_STATE_LABELS,
  GATE_LABELS,
  HEALTH_LABELS,
  runLaunchReview,
  type ApprovalGate,
  type DefectRow,
  type LaunchCheck,
  type QaCheck,
} from "@/lib/quality/approval-gate";
import { cn, formatEnumLabel } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Chrome                                                                     */
/* -------------------------------------------------------------------------- */

function Panel({
  icon: Icon,
  title,
  action,
  className,
  children,
}: {
  icon: typeof Bug;
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
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

function Quiet({ children }: { children: string }) {
  return <p className="py-6 text-center text-xs text-slate-400">{children}</p>;
}

/** One of the four tiles across the top. */
function SummaryTile({
  icon: Icon,
  tone,
  label,
  value,
  caption,
}: {
  icon: typeof Bug;
  tone: "violet" | "rose" | "amber" | "sky";
  label: string;
  value: string;
  caption: string;
}) {
  const tones = {
    violet: "bg-violet-50 text-violet-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
    sky: "bg-sky-50 text-sky-600",
  } as const;

  const values = {
    violet: "text-violet-700",
    rose: "text-rose-600",
    amber: "text-amber-600",
    sky: "text-sky-700",
  } as const;

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
      <span
        aria-hidden
        className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tones[tone])}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-500">{label}</p>
        <p className={cn("truncate text-lg font-semibold leading-tight", values[tone])}>
          {value}
        </p>
        <p className="truncate text-[11px] text-slate-400">{caption}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className="min-w-0 text-right text-xs font-medium text-slate-800">{value}</span>
    </div>
  );
}

const QA_TONE: Record<string, string> = {
  PASSED: "text-emerald-600",
  FAILED: "text-rose-600",
  RETEST_REQUIRED: "text-amber-600",
  BLOCKED: "text-rose-600",
  NOT_RUN: "text-slate-400",
  SKIPPED: "text-slate-400",
};

const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: "border-rose-200 bg-rose-50 text-rose-700",
  HIGH: "border-rose-200 bg-rose-50 text-rose-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  LOW: "border-slate-200 bg-slate-50 text-slate-600",
};

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

export interface ApprovalHistoryEntry {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  kind: "qa" | "defect" | "approval" | "launch" | "other";
}

export interface ApprovalWorkspaceProps {
  clientId: string;
  gate: ApprovalGate;
  qaChecks: QaCheck[];
  defects: DefectRow[];
  launchChecks: LaunchCheck[];
  history: ApprovalHistoryEntry[];
  stage: {
    name: string;
    ownerName: string | null;
    dueDate: string | null;
    day: number;
    targetDays: number | null;
  };
  /** The launch this checklist belongs to, for the review action. */
  launchId: string | null;
  /** For the defect form and the sign-off form, from the account itself. */
  assignees: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  approvers: { id: string; name: string; role: string | null }[];
  approvalTypes: { value: string; label: string }[];
  permissions: {
    canTest: boolean;
    canCloseDefect: boolean;
    canRecordApproval: boolean;
    canActivateLaunch: boolean;
  };
}

/** What every panel needs: the data, and a way to open a working surface. */
type PanelProps = ApprovalWorkspaceProps & {
  onOpen: (dialog: "qa" | "defects" | "raise" | "launch" | "approval") => void;
};

function shortDate(iso: string | null) {
  if (!iso) return null;

  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ClientApprovalWorkspace(props: ApprovalWorkspaceProps) {
  const { gate, stage, permissions } = props;
  const router = useRouter();
  const [reviewResult, setReviewResult] = useState<string[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  /*
   * Which working surface is open.
   *
   * These replaced three older workspaces that used to sit under this page.
   * Two views of the same records is one too many, and the summary cards
   * linking down to them meant the page had to render both.
   */
  const [dialog, setDialog] = useState<
    "qa" | "defects" | "raise" | "launch" | "approval" | null
  >(null);
  /** The QA check a defect is being raised against, where there is one. */
  const [defectFrom, setDefectFrom] = useState<QaCheck | null>(null);

  /*
   * The review runs against the same gate the page is rendering, so it can
   * never pass on figures the reader is not looking at. It is a validation and
   * changes nothing - launching remains the launch record's own action, which
   * has its own permission and its own confirmation.
   */
  function startLaunchReview() {
    setReviewing(true);

    const result = runLaunchReview(gate);

    setReviewResult(result.passed ? [] : result.failures);
    setReviewing(false);
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ four summary tiles */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          icon={ShieldCheck}
          tone="violet"
          label="Internal QA"
          value={gate.qa.label}
          caption={gate.qa.total === 0 ? "No checks configured" : `${gate.qa.percent}% complete`}
        />
        <SummaryTile
          icon={Bug}
          tone="rose"
          label="Open Defects"
          value={String(gate.defects.total)}
          caption={
            gate.defects.blocking.length > 0
              ? `${gate.defects.blocking.length} critical or high`
              : gate.defects.total === 0
                ? "Nothing outstanding"
                : "Require attention"
          }
        />
        <SummaryTile
          icon={UserCheck}
          tone="amber"
          label="Client Approval"
          value={APPROVAL_STATE_LABELS[gate.approval.state]}
          caption={
            gate.approval.daysOverdue !== null
              ? `${gate.approval.daysOverdue} days overdue`
              : gate.approval.state === "WAITING_ON_CLIENT"
                ? "On client response"
                : gate.approval.state === "APPROVED"
                  ? "Signed off"
                  : "Not yet requested"
          }
        />
        <SummaryTile
          icon={Rocket}
          tone="sky"
          label="Launch Readiness"
          value={`${gate.launch.complete} / ${gate.launch.total}`}
          caption={
            gate.launch.total === 0
              ? "No checks configured"
              : gate.launch.blocking.length > 0
                ? `${gate.launch.blocking.length} blocking`
                : "Checks complete"
          }
        />
      </div>

      {/* ------------------------------------------------------ the main band */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <QaPanel {...props} onOpen={setDialog} />
        <DefectsPanel {...props} onOpen={setDialog} />
        <ClientApprovalPanel {...props} onOpen={setDialog} />

        <Panel icon={ClipboardCheck} title="Approval Stage Details">
          <div className="divide-y divide-slate-100">
            <Row label="Current Phase" value={<Badge tone="amber">{GATE_LABELS[gate.state]}</Badge>} />
            <Row label="Stage Owner" value={stage.ownerName ?? "Not assigned"} />
            <Row label="Due Date" value={shortDate(stage.dueDate) ?? "Not set"} />
            <Row
              label="Days in Phase"
              value={
                stage.targetDays === null
                  ? `Day ${stage.day}`
                  : `${stage.day} of ${stage.targetDays}`
              }
            />
            <Row
              label="Blocking Items"
              value={
                <span className={gate.blockers.length > 0 ? "text-rose-600" : "text-emerald-600"}>
                  {gate.blockers.length}
                </span>
              }
            />
            <Row
              label="Risk Level"
              value={
                <Badge
                  tone={
                    gate.health === "BLOCKED"
                      ? "rose"
                      : gate.health === "AT_RISK"
                        ? "rose"
                        : gate.health === "NEEDS_ATTENTION"
                          ? "amber"
                          : "emerald"
                  }
                >
                  {HEALTH_LABELS[gate.health]}
                </Badge>
              }
            />
          </div>
        </Panel>
      </div>

      {/* ----------------------------------------------------- the lower band */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <LaunchPanel {...props} onOpen={setDialog} />

        <Panel icon={Clock} title="Approval History" className="xl:col-span-2">
          {props.history.length === 0 ? (
            <Quiet>No approval activity yet.</Quiet>
          ) : (
            <ol className="space-y-2.5">
              {props.history.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      entry.kind === "defect" && "bg-rose-500",
                      entry.kind === "qa" && "bg-violet-500",
                      entry.kind === "approval" && "bg-amber-500",
                      entry.kind === "launch" && "bg-sky-500",
                      entry.kind === "other" && "bg-slate-300",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-5 text-slate-800">{entry.action}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(entry.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {entry.actorName ? ` - ${entry.actorName}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {/*
            * TabLink, not an anchor to ?tab=activity. From inside the client
            * record that is a soft navigation: the tab strip never remounts,
            * so the address bar moves and the reader stays put.
            */}
          <TabLink
            tab="activity"
            clientId={props.clientId}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
          >
            View full history
            <ExternalLink className="h-3 w-3" aria-hidden />
          </TabLink>
        </Panel>

        <div className="min-w-0 space-y-4">
          <QuickActions
            {...props}
            onOpen={setDialog}
            onStartLaunchReview={startLaunchReview}
            reviewing={reviewing}
          />

          {/* ------------------------------------------------ approval health */}
          <Panel icon={Activity} title="Approval Health">
            <p
              className={cn(
                "text-center text-sm font-semibold",
                gate.health === "GOOD" && "text-emerald-600",
                gate.health === "NEEDS_ATTENTION" && "text-amber-600",
                (gate.health === "AT_RISK" || gate.health === "BLOCKED") && "text-rose-600",
              )}
            >
              {HEALTH_LABELS[gate.health]}
            </p>

            {/*
              * The reasons, not just the gauge. A score somebody cannot take
              * apart is a score they learn to ignore.
              */}
            <ul className="mt-2 space-y-1">
              {gate.risks.length === 0 ? (
                <li className="text-center text-xs text-slate-500">
                  Nothing outstanding on this account.
                </li>
              ) : (
                gate.risks.map((risk) => (
                  <li key={risk} className="flex items-start gap-1.5 text-xs leading-5 text-slate-600">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden />
                    {risk}
                  </li>
                ))
              )}
            </ul>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={cn(
                  "h-full rounded-full",
                  gate.healthScore >= 80
                    ? "bg-emerald-500"
                    : gate.healthScore >= 60
                      ? "bg-amber-500"
                      : "bg-rose-500",
                )}
                style={{ width: `${gate.healthScore}%` }}
              />
            </div>
            <p className="mt-1 text-center text-[11px] text-slate-500">
              Overall health: {gate.healthScore}
            </p>

            <button
              type="button"
              onClick={() => setHealthOpen((open) => !open)}
              className="mt-2 w-full text-center text-xs font-semibold text-sky-700 hover:text-sky-800"
            >
              {healthOpen ? "Hide details" : "View details"}
            </button>

            {healthOpen ? (
              <dl className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                {gate.factors.map((factor) => (
                  <div key={factor.label}>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-[11px] font-medium text-slate-700">{factor.label}</dt>
                      <dd className="text-[11px] font-semibold text-slate-900">{factor.score}</dd>
                    </div>
                    <p className="text-[10px] leading-4 text-slate-500">{factor.detail}</p>
                  </div>
                ))}
              </dl>
            ) : null}
          </Panel>
        </div>
      </div>

      {/* The review result, shown where the reader pressed the button. */}
      {reviewResult !== null ? (
        <div
          className={cn(
            "rounded-2xl border px-4 py-3",
            reviewResult.length === 0
              ? "border-emerald-200 bg-emerald-50"
              : "border-rose-200 bg-rose-50",
          )}
        >
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              reviewResult.length === 0 ? "text-emerald-800" : "text-rose-800",
            )}
          >
            {reviewResult.length === 0 ? (
              <CircleCheck className="h-4 w-4" aria-hidden />
            ) : (
              <TriangleAlert className="h-4 w-4" aria-hidden />
            )}
            {reviewResult.length === 0
              ? "Launch review passed. Every gate is clear."
              : `Cannot start launch review. ${reviewResult.length} item${
                  reviewResult.length === 1 ? "" : "s"
                } require attention:`}
          </p>

          {reviewResult.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {reviewResult.map((failure) => (
                <li key={failure} className="text-xs leading-5 text-rose-800">
                  - {failure}
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setReviewResult(null);
              router.refresh();
            }}
            className="mt-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {dialog === "qa" ? (
        <QaChecklistDialog
          checks={props.qaChecks}
          canTest={permissions.canTest}
          onClose={() => setDialog(null)}
          onRaiseDefect={(check) => {
            setDefectFrom(check);
            setDialog("raise");
          }}
        />
      ) : null}

      {dialog === "defects" ? (
        <DefectsDialog
          defects={props.defects}
          canClose={permissions.canCloseDefect}
          onClose={() => setDialog(null)}
          onRaise={() => {
            setDefectFrom(null);
            setDialog("raise");
          }}
        />
      ) : null}

      {dialog === "raise" ? (
        <RaiseDefectDialog
          clientId={props.clientId}
          assignees={props.assignees}
          projects={props.projects}
          prefillFrom={defectFrom}
          onClose={() => {
            setDefectFrom(null);
            setDialog(null);
          }}
        />
      ) : null}

      {dialog === "launch" ? (
        <LaunchChecklistDialog
          checks={props.launchChecks}
          canManage={permissions.canActivateLaunch}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog === "approval" ? (
        <RecordApprovalDialog
          clientId={props.clientId}
          approvers={props.approvers}
          projects={props.projects}
          approvalTypes={props.approvalTypes}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {!permissions.canActivateLaunch && gate.state === "READY_FOR_LAUNCH_REVIEW" ? (
        <p className="text-[11px] text-slate-400">
          Everything is clear. Activating the launch needs the launch permission, which this
          account does not hold.
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Panels                                                                     */
/* -------------------------------------------------------------------------- */

function QaPanel({ gate, qaChecks, onOpen }: PanelProps) {
  return (
    <Panel icon={ShieldCheck} title="Internal Quality Assurance">
      {gate.qa.total === 0 ? (
        <Quiet>No QA checks configured.</Quiet>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-slate-500">QA Completion</span>
            <span className="text-sm font-semibold text-slate-900">{gate.qa.percent}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${gate.qa.percent}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {gate.qa.passed} of {gate.qa.total} checks complete
          </p>

          <div className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
            <Row label="QA Owner" value={gate.qa.ownerName ?? "Not assigned"} />
            <Row
              label="QA Status"
              value={
                <Badge tone={gate.qa.complete ? "emerald" : gate.qa.failed > 0 ? "rose" : "amber"}>
                  {gate.qa.label}
                </Badge>
              }
            />
          </div>

          <p className="mt-3 text-[10px] uppercase tracking-wide text-slate-400">
            Checklist preview
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {qaChecks.slice(0, 4).map((check) => (
              <li key={check.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-slate-700">{check.objective}</span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-medium",
                    QA_TONE[check.status] ?? "text-slate-400",
                  )}
                >
                  {formatEnumLabel(check.status)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        * The QA plans already have a screen. This opens it rather than
        * growing a second checklist that would have to be kept in step.
        */}
      <button
        type="button"
        onClick={() => onOpen("qa")}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
        View full QA checklist
      </button>
    </Panel>
  );
}

function DefectsPanel({ gate, defects, permissions, onOpen }: PanelProps) {
  return (
    <Panel
      icon={Bug}
      title="Open Defects"
      action={
        permissions.canTest ? (
          <button
            type="button"
            onClick={() => onOpen("raise")}
            className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Raise defect
          </button>
        ) : null
      }
    >
      {gate.defects.open.length === 0 ? (
        <Quiet>No open defects.</Quiet>
      ) : (
        <ul className="space-y-2">
          {gate.defects.open.slice(0, 3).map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onOpen("defects")}
                className="block rounded-xl border border-slate-200 p-2.5 transition hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                      SEVERITY_TONE[entry.severity] ?? SEVERITY_TONE.LOW,
                    )}
                  >
                    {entry.severity}
                  </span>
                  <span className="min-w-0 flex-1 text-xs font-medium leading-4 text-slate-900">
                    {entry.title}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] text-slate-500">
                  <span className="truncate">{entry.assignedToName ?? "Unassigned"}</span>
                  <span className="truncate">{shortDate(entry.reportedAt)}</span>
                  <span className="truncate text-right">{formatEnumLabel(entry.status)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {defects.length > gate.defects.open.slice(0, 3).length ? (
        <button
          type="button"
          onClick={() => onOpen("defects")}
          className="mt-3 inline-block text-xs font-semibold text-sky-700 hover:text-sky-800"
        >
          View all defects ({defects.length})
        </button>
      ) : null}
    </Panel>
  );
}

function ClientApprovalPanel({ gate, permissions, onOpen }: PanelProps) {
  const { approval } = gate;

  return (
    <Panel icon={UserCheck} title="Client Approval">
      <div className="divide-y divide-slate-100">
        <Row
          label="Approval Status"
          value={
            <Badge
              tone={
                approval.state === "APPROVED"
                  ? "emerald"
                  : approval.state === "OVERDUE"
                    ? "rose"
                    : approval.state === "NOT_REQUESTED"
                      ? "slate"
                      : "amber"
              }
            >
              {APPROVAL_STATE_LABELS[approval.state]}
            </Badge>
          }
        />
        <Row label="Approver" value={approval.approverName ?? "Not assigned"} />
        <Row label="Requested" value={shortDate(approval.requestedAt) ?? "Not requested"} />
        <Row
          label="Follow-up due"
          value={
            approval.deadline ? (
              <span className={approval.daysOverdue !== null ? "text-rose-600" : undefined}>
                {shortDate(approval.deadline)}
                {approval.daysOverdue !== null ? ` (${approval.daysOverdue}d over)` : ""}
              </span>
            ) : (
              "Not set"
            )
          }
        />
        {approval.round ? <Row label="Round" value={`Round ${approval.round.roundNumber}`} /> : null}
      </div>

      {approval.state === "NOT_REQUESTED" ? (
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] leading-4 text-slate-600">
          Approval has not been requested yet.
        </p>
      ) : approval.state === "APPROVED" ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] leading-4 text-emerald-800">
          Signed off{approval.record?.approvedByName ? ` by ${approval.record.approvedByName}` : ""}
          {approval.record?.evidenceUrl ? " with evidence on file." : ". No evidence recorded."}
        </p>
      ) : (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-4 text-amber-800">
          {approval.state === "REVISIONS_REQUIRED"
            ? "The client asked for changes. Revision work is tracked as tasks."
            : "Waiting for the client to review and approve the deliverables."}
        </p>
      )}

      {/*
        * Recording a sign-off lives in the approvals workspace lower down the
        * page, which already validates the approver and stores the evidence.
        * This links to it rather than offering a second way in.
        */}
      {permissions.canRecordApproval ? (
        <button
          type="button"
          onClick={() => onOpen("approval")}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-950 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          {approval.state === "APPROVED" ? "View sign-off record" : "Record approval"}
        </button>
      ) : null}
    </Panel>
  );
}

function LaunchPanel({ gate, launchChecks, onOpen }: PanelProps) {
  return (
    <Panel
      icon={Rocket}
      title="Launch Readiness"
      action={
        <span className="shrink-0 text-[11px] font-medium text-slate-500">
          {gate.launch.complete} / {gate.launch.total} complete
        </span>
      }
    >
      {gate.launch.total === 0 ? (
        <Quiet>No launch checks configured.</Quiet>
      ) : (
        <ul className="space-y-1.5">
          {launchChecks.slice(0, 7).map((check) => {
            const done = check.status === "COMPLETE";
            const blocking = check.isRequired && !done;

            return (
              <li key={check.id} className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-start gap-1.5">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      done ? "bg-emerald-500" : blocking ? "bg-rose-500" : "bg-amber-400",
                    )}
                  />
                  <span className="min-w-0 truncate text-xs text-slate-700">{check.label}</span>
                  {blocking ? (
                    <span className="shrink-0 rounded border border-rose-200 bg-rose-50 px-1 text-[8px] font-bold uppercase text-rose-700">
                      Blocker
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-medium",
                    done ? "text-emerald-600" : "text-slate-400",
                  )}
                >
                  {formatEnumLabel(check.status)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onOpen("launch")}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        <Rocket className="h-3.5 w-3.5" aria-hidden />
        Open launch checklist
      </button>
    </Panel>
  );
}

/**
 * Quick actions, decided by the gate.
 *
 * Sections 33 to 39: the list changes with the phase, so nobody is offered
 * "Send Reminder" on an account nobody has asked yet, or "Request Approval" on
 * work that has not passed QA.
 */
function QuickActions({
  gate,
  clientId,
  permissions,
  onOpen,
  onStartLaunchReview,
  reviewing,
}: PanelProps & {
  onStartLaunchReview: () => void;
  reviewing: boolean;
}) {
  /**
   * One action. Either it opens a working surface here or it leaves the page.
   *
   * `dialog` and `href` are exclusive so nothing can be half-wired: an action
   * that names neither will not compile.
   */
  type Action =
    | { label: string; dialog: Parameters<typeof onOpen>[0]; href?: never }
    | { label: string; tab: "tasks"; dialog?: never };

  const actions: Action[] = [];

  const qa: Action = { label: "View QA checklist", dialog: "qa" };
  const raise: Action = { label: "Raise defect", dialog: "raise" };
  const approval: Action = { label: "Record approval", dialog: "approval" };
  const viewApproval: Action = { label: "View approval history", dialog: "approval" };
  const launch: Action = { label: "Open launch checklist", dialog: "launch" };
  const defects: Action = { label: "Resolve launch blockers", dialog: "defects" };
  const work: Action = { label: "Open revision work", tab: "tasks" };

  /*
   * Sections 35 to 40: what is offered follows the phase, so nobody is shown
   * "Record approval" on work that has not passed QA, or a launch checklist on
   * an account still failing its tests.
   */
  switch (gate.state) {
    case "QA_IN_PROGRESS":
    case "QA_FAILING":
      actions.push(qa);
      if (permissions.canTest) actions.push(raise);
      break;

    case "QA_READY":
      if (permissions.canRecordApproval) actions.push(approval);
      actions.push(qa);
      if (permissions.canTest) actions.push(raise);
      break;

    case "WAITING_ON_CLIENT":
      if (permissions.canRecordApproval) actions.push(approval);
      if (permissions.canTest) actions.push(raise);
      break;

    case "REVISIONS_REQUIRED":
      actions.push(work, viewApproval);
      break;

    case "LAUNCH_BLOCKED":
      actions.push(launch);
      if (gate.defects.open.length > 0) actions.push(defects);
      break;

    case "READY_FOR_LAUNCH_REVIEW":
      actions.push(launch);
      break;
  }

  return (
    <Panel icon={Zap} title="Quick Actions">
      <ul className="space-y-1.5">
        {actions.map((action) => (
          <li key={action.label}>
            {action.dialog ? (
              <button
                type="button"
                onClick={() => onOpen(action.dialog)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {action.label}
                <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
              </button>
            ) : (
              <TabLink
                tab={action.tab}
                clientId={clientId}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {action.label}
                <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
              </TabLink>
            )}
          </li>
        ))}

        {/*
          * Requesting sign-off and chasing it are the two actions this page
          * cannot perform. There is no mail or SMS service in the application,
          * so a Request Approval button would compose a message nothing sends.
          * Shown disabled with the reason rather than hidden, because their
          * absence would otherwise look like an oversight.
          */}
        {gate.state === "QA_READY" || gate.state === "WAITING_ON_CLIENT" ? (
          <li>
            <span
              title="No email or SMS service is configured, so this cannot send. Record the approval once the client replies."
              className="flex cursor-not-allowed items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs font-medium text-slate-400"
            >
              {gate.state === "QA_READY" ? "Request approval" : "Send reminder"}
              <span className="shrink-0 text-[10px] uppercase">No mailer</span>
            </span>
          </li>
        ) : null}

        {/*
          * Always offered where a checklist exists, because the useful answer
          * to "can we launch" is the list of what is missing - refusing to run
          * the check until everything already passes would make it pointless.
          */}
        {gate.canStartLaunchReview ? (
          <li>
            <Button
              type="button"
              size="sm"
              className="w-full justify-between gap-2"
              disabled={reviewing}
              onClick={onStartLaunchReview}
            >
              Start launch review
              {reviewing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Rocket className="h-3.5 w-3.5" aria-hidden />
              )}
            </Button>
          </li>
        ) : null}
      </ul>
    </Panel>
  );
}
