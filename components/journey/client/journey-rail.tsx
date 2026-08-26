"use client";

/**
 * The right rail and the two lower cards the reference lays out.
 *
 * Every one of these is built from something already loaded for this page - the
 * flags the agency raised, the templates the stage will run, the requirement
 * gate, the health factors. Nothing here fetches, and nothing here is a
 * placeholder: a card that cannot be filled from real data is not rendered at
 * all rather than shown empty with a button that does nothing.
 */

import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  MailQuestion,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { getStageTaskTemplates } from "@/lib/automation/stage-automation";
import type { JourneyFlag } from "@/lib/journey/client-detail";
import type { JourneyHealth } from "@/lib/journey/journey-health";
import { cn, formatDate } from "@/lib/utils";

function Panel({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon?: typeof Gauge;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-950">
          {Icon ? <Icon className="h-4 w-4 text-slate-400" aria-hidden /> : null}
          {title}
        </h2>
        {action}
      </header>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Journey health                                                             */
/* -------------------------------------------------------------------------- */

const HEALTH_ARC: Record<string, string> = {
  ON_TRACK: "text-emerald-500",
  WAITING: "text-amber-500",
  AT_RISK: "text-amber-600",
  BLOCKED: "text-rose-500",
};

/**
 * The score, with the reasons beside it.
 *
 * The number is never shown on its own. A project manager cannot act on "63",
 * and the whole point of scoring the journey was to say which part of it is
 * dragging - so the factors that moved it are on the card, not hidden behind a
 * dialog nobody opens.
 */
export function JourneyHealthCard({
  health,
  statusLabel,
  onAssess,
}: {
  health: JourneyHealth;
  /** The existing health label, which stays the authority on what to call it. */
  statusLabel: string;
  onAssess: () => void;
}) {
  const circumference = 2 * Math.PI * 26;
  const filled = (health.score / 100) * circumference;

  return (
    <Panel title="Journey Health" icon={Gauge}>
      <div className="flex items-center gap-4">
        <div className="relative h-[68px] w-[68px] shrink-0">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              strokeWidth="6"
              className="stroke-slate-100"
            />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              className={cn("stroke-current", HEALTH_ARC[health.status] ?? "text-slate-400")}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums text-slate-950">
            {health.score}
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{statusLabel}</p>
          <ul className="mt-1 space-y-0.5">
            {health.reasons.map((reason) => (
              <li key={reason.text} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                <span
                  className={cn(
                    "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                    reason.tone === "good"
                      ? "bg-emerald-500"
                      : reason.tone === "warn"
                        ? "bg-amber-500"
                        : "bg-rose-500",
                  )}
                  aria-hidden
                />
                {reason.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-3 w-full gap-1.5"
        onClick={onAssess}
      >
        <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
        Health assessment
      </Button>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Quick actions                                                              */
/* -------------------------------------------------------------------------- */

export interface QuickAction {
  key: string;
  label: string;
  icon: typeof Plus;
  onSelect: () => void;
  /** The one action worth doing first, drawn as the primary. */
  primary?: boolean;
  disabled?: boolean;
}

/**
 * What this stage actually offers.
 *
 * Assembled by the caller from what the viewer may do and what the account is
 * waiting on, so a stage with nothing outstanding does not offer to chase it.
 */
export function QuickActionsCard({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null;

  return (
    <Panel title="Quick Actions" icon={Sparkles}>
      <ul className="space-y-1.5">
        {actions.map((action) => (
          <li key={action.key}>
            <button
              type="button"
              onClick={action.onSelect}
              disabled={action.disabled}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition disabled:opacity-50",
                action.primary
                  ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
                  : "border-slate-200 text-slate-700 hover:bg-slate-50",
              )}
            >
              <span className="flex items-center gap-2">
                <action.icon className="h-3.5 w-3.5" aria-hidden />
                {action.label}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Client dependencies                                                        */
/* -------------------------------------------------------------------------- */

/**
 * What the agency is waiting on the client for.
 *
 * Read from the waiting flags somebody actually raised, so the card cannot
 * claim a dependency nobody recorded. Rendered only when there is one.
 */
export function ClientDependenciesCard({
  flags,
  now,
  onFollowUp,
  canAct,
}: {
  flags: JourneyFlag[];
  now: Date;
  /**
   * Opens the waiting record for editing. Deliberately not a send: nothing in
   * this application sends email or SMS, and a button that implies it would be
   * a promise the system cannot keep.
   */
  onFollowUp: (flag: JourneyFlag) => void;
  canAct: boolean;
}) {
  const waiting = flags.filter((flag) => flag.kind === "WAITING_ON_CLIENT");

  if (waiting.length === 0) return null;

  const ageOf = (flag: JourneyFlag) =>
    Math.max(
      0,
      Math.round((now.getTime() - new Date(flag.raisedAt).getTime()) / 86_400_000),
    );

  const oldest = Math.max(...waiting.map(ageOf));

  return (
    <Panel title="Client Dependencies" icon={MailQuestion}>
      <p className="text-xs text-slate-600">
        {waiting.length} item{waiting.length === 1 ? "" : "s"} waiting on the client
        {oldest > 0 ? ` · oldest request ${oldest} day${oldest === 1 ? "" : "s"}` : ""}
      </p>

      <ul className="mt-2.5 space-y-2">
        {waiting.map((flag) => (
          <li key={flag.id} className="rounded-lg border border-slate-200 p-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 text-xs font-medium text-slate-900">{flag.reason}</p>
              {flag.dueAt ? (
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                    new Date(flag.dueAt) < now
                      ? "bg-rose-50 text-rose-700"
                      : "bg-amber-50 text-amber-700",
                  )}
                >
                  Due {formatDate(flag.dueAt)}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Requested {formatDate(flag.raisedAt)}
              {flag.raisedByName ? ` by ${flag.raisedByName}` : ""}
            </p>
            {canAct ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-2 gap-1.5"
                onClick={() => onFollowUp(flag)}
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                Update request
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Upcoming stage                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What advancing will actually do.
 *
 * The entry actions are read from the same template catalogue the transition
 * runs, so this is a preview of the real automation rather than a description
 * of it written separately and left to drift. A stage whose key we do not have
 * shows the name and no promises.
 */
export function UpcomingStageCard({
  nextStageName,
  nextStageKey,
  onPreview,
}: {
  nextStageName: string | null;
  nextStageKey: string | null;
  onPreview: () => void;
}) {
  if (!nextStageName) {
    return (
      <Panel title="Upcoming Stage" icon={ArrowRight}>
        <p className="text-xs text-slate-600">
          This account is at the end of the journey.
        </p>
      </Panel>
    );
  }

  const templates = nextStageKey ? getStageTaskTemplates(nextStageKey) : [];

  return (
    <Panel
      title="Upcoming Stage"
      icon={ArrowRight}
      action={
        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
          Next
        </span>
      }
    >
      <p className="text-sm font-semibold text-slate-950">{nextStageName}</p>

      {templates.length > 0 ? (
        <>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Entry actions ({templates.length})
          </p>
          <ul className="mt-1.5 space-y-1">
            {templates.slice(0, 4).map((template) => (
              <li
                key={template.title}
                className="flex items-start gap-1.5 text-[11px] text-slate-600"
              >
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-slate-300" aria-hidden />
                {template.title}
              </li>
            ))}
            {templates.length > 4 ? (
              <li className="text-[11px] text-slate-400">
                and {templates.length - 4} more
              </li>
            ) : null}
          </ul>
        </>
      ) : (
        <p className="mt-1.5 text-[11px] text-slate-500">
          Entering this stage creates no automatic work.
        </p>
      )}

      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-3 w-full gap-1.5"
        onClick={onPreview}
      >
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        View stage details
      </Button>
    </Panel>
  );
}
