"use client";

/**
 * The journey laid out as the reference draws it.
 *
 * One card carries the timeline and the summary row beneath it, because they
 * answer one question together - where is this account and how close is it to
 * leaving. The rail beside them holds the things you glance at rather than act
 * on. Everything here reads from data the page already loaded; a card with
 * nothing real behind it is not drawn.
 */

import {
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardCheck,
  FolderOpen,
  Lock,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { JourneyAccount } from "@/lib/journey/journey-board";
import type {
  NextStep,
  RequirementGroups,
  StageClock,
} from "@/lib/journey/client-detail";
import type { JourneyHealth } from "@/lib/journey/journey-health";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-4">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        {action}
      </header>
      <div className="px-4 pb-4 pt-3">{children}</div>
    </section>
  );
}

function Initials({ name, tone = "slate" }: { name: string; tone?: "slate" | "indigo" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        tone === "indigo" ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-600",
      )}
    >
      {initials || "?"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* The journey card                                                           */
/* -------------------------------------------------------------------------- */

export interface TimelineStep {
  id: string;
  name: string;
  state: "done" | "current" | "future";
  /** When the account entered it, for the stages it has already reached. */
  enteredAt: string | null;
}

/**
 * The stepper.
 *
 * Horizontally scrollable rather than squeezed: fifteen stages do not fit on a
 * phone, and shrinking them until the labels are unreadable is worse than
 * asking somebody to swipe.
 */
function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-start gap-0">
        {steps.map((step, index) => (
          <li key={step.id} className="flex min-w-0 items-start">
            <div className="flex w-[104px] shrink-0 flex-col items-center text-center">
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2",
                  step.state === "done" && "border-emerald-500 bg-emerald-500 text-white",
                  step.state === "current" && "border-amber-400 bg-amber-50 text-amber-600",
                  step.state === "future" && "border-slate-200 bg-slate-50 text-slate-300",
                )}
              >
                {step.state === "done" ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : step.state === "current" ? (
                  <FolderOpen className="h-4 w-4" aria-hidden />
                ) : (
                  <Lock className="h-3.5 w-3.5" aria-hidden />
                )}
              </span>

              <span
                className={cn(
                  "mt-2 text-[11px] leading-tight",
                  step.state === "future" ? "text-slate-400" : "font-medium text-slate-800",
                )}
              >
                {step.name}
              </span>

              {step.state === "current" ? (
                <span className="mt-0.5 text-[10px] font-semibold text-amber-600">Current</span>
              ) : step.enteredAt ? (
                <span className="mt-0.5 text-[10px] text-slate-400">
                  {formatDate(step.enteredAt)}
                </span>
              ) : null}
            </div>

            {index < steps.length - 1 ? (
              <span
                className={cn(
                  "mt-[18px] h-0.5 w-6 shrink-0",
                  step.state === "done" ? "bg-emerald-400" : "bg-slate-200",
                )}
                aria-hidden
              />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The whole top card: where the account is, how ready it is to leave, and the
 * one thing worth doing about it.
 */
export function JourneyCard({
  account,
  steps,
  clock,
  groups,
  step,
  secondaryStatus,
  description,
  onChangeOwner,
  onPrimary,
  onViewRequirement,
  canChangeOwner,
}: {
  account: JourneyAccount;
  steps: TimelineStep[];
  clock: StageClock;
  groups: RequirementGroups;
  step: NextStep;
  secondaryStatus: string | null;
  description: string | null;
  onChangeOwner: () => void;
  onPrimary: () => void;
  onViewRequirement: () => void;
  canChangeOwner: boolean;
}) {
  const total = groups.required.length;
  const met = total - groups.outstanding.length;
  const percent = total === 0 ? 100 : Math.round((met / total) * 100);

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
      <h2 className="text-sm font-semibold text-slate-950">Client Journey</h2>

      <div className="mt-4">
        <Timeline steps={steps} />
      </div>

      <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* ---- where it is ------------------------------------------------ */}
        <div className="flex min-w-0 gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <FolderOpen className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Current Stage</p>
            <p className="text-sm font-semibold text-slate-950">{account.stageName}</p>
            {secondaryStatus ? (
              <span className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                {secondaryStatus}
              </span>
            ) : null}
            {description ? (
              <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{description}</p>
            ) : null}
          </div>
        </div>

        {/* ---- how close it is to leaving --------------------------------- */}
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Stage Readiness</p>
          <div className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold text-slate-950">
              {met} of {total}
            </span>
            <span className="text-sm font-semibold text-slate-700">{percent}%</span>
          </div>
          <p className="text-[11px] text-slate-500">required exit items complete</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full rounded-full",
                percent === 100 ? "bg-emerald-500" : "bg-amber-400",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px]">
            {total === 0 ? (
              <span className="text-slate-500">No required exit items on this stage</span>
            ) : groups.outstanding.length === 0 ? (
              <span className="font-medium text-emerald-600">Stage ready to advance</span>
            ) : (
              <>
                <span className="font-semibold text-amber-600">
                  {groups.outstanding.length}
                </span>
                <span className="text-slate-500">
                  {" "}
                  blocking item{groups.outstanding.length === 1 ? "" : "s"} remaining
                </span>
              </>
            )}
          </p>
        </div>

        {/* ---- how long it has been there --------------------------------- */}
        <div className="min-w-0">
          <div className="flex gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Entered</p>
              <p className="text-xs font-medium text-slate-800">
                {formatDate(clock.enteredAt)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-400">Days in Stage</p>
              <p
                className={cn(
                  "text-xs font-medium",
                  clock.isOverTarget ? "text-rose-600" : "text-slate-800",
                )}
              >
                {clock.targetDays === null
                  ? `${clock.day}`
                  : `${clock.day} of ${clock.targetDays}`}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Stage Owner</p>
            <span className="mt-0.5 flex items-center gap-1.5">
              <Initials name={account.ownerName ?? "Unassigned"} tone="indigo" />
              <span className="truncate text-xs font-medium text-slate-800">
                {account.ownerName ?? "Unassigned"}
              </span>
            </span>
            {canChangeOwner ? (
              <button
                type="button"
                onClick={onChangeOwner}
                className="mt-0.5 text-[11px] font-medium text-indigo-600 hover:underline"
              >
                Change Owner
              </button>
            ) : null}
          </div>
        </div>

        {/* ---- the one thing to do about it ------------------------------- */}
        <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            Next Best Action
          </p>
          <p className="mt-1.5 text-xs font-semibold leading-4 text-slate-900">{step.detail}</p>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" className="gap-1.5" onClick={onPrimary}>
              {step.action}
            </Button>
            {groups.outstanding.length > 0 ? (
              <Button type="button" size="sm" variant="secondary" onClick={onViewRequirement}>
                View Requirement
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Stage details                                                              */
/* -------------------------------------------------------------------------- */

function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[11px] text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-[11px] font-medium text-slate-800">{children}</dd>
    </div>
  );
}

/**
 * The rail's reference panel: everything about this stage as plain rows.
 *
 * Facts only. Anything that needs a decision lives in Quick Actions, so this
 * card stays something you read rather than something you operate.
 */
export function StageDetailsPanel({
  account,
  clock,
  groups,
  secondaryStatus,
  healthLabel,
  waitingSince,
  now,
  blockingItems,
  onHealthDetails,
}: {
  account: JourneyAccount;
  clock: StageClock;
  groups: RequirementGroups;
  secondaryStatus: string | null;
  healthLabel: string;
  waitingSince: string | null;
  now: Date;
  /** Required exit items still outstanding, counted from the requirements. */
  blockingItems: number;
  /** Opens the journey health breakdown that already exists. */
  onHealthDetails?: () => void;
}) {
  const targetExit =
    clock.targetDays === null
      ? null
      : new Date(
          new Date(clock.enteredAt).getTime() + clock.targetDays * 86_400_000,
        ).toISOString();

  const waitingDays =
    waitingSince === null
      ? null
      : Math.max(
          0,
          Math.round((now.getTime() - new Date(waitingSince).getTime()) / 86_400_000),
        );

  return (
    <Panel title="Stage Details">
      <dl className="divide-y divide-slate-50">
        <Row label="Stage Owner">
          <span className="flex items-center justify-end gap-1.5">
            <Initials name={account.ownerName ?? "Unassigned"} tone="indigo" />
            {account.ownerName ?? "Unassigned"}
          </span>
        </Row>
        <Row label="Stage Entry Date">{formatDate(clock.enteredAt)}</Row>
        <Row label="Target Duration">
          {clock.targetDays === null ? "No target" : `${clock.targetDays} days`}
        </Row>
        {targetExit ? (
          <Row label="Target Exit Date">
            <span className={clock.isOverTarget ? "text-rose-600" : undefined}>
              {formatDate(targetExit)}
              {clock.remainingLabel ? ` (${clock.remainingLabel})` : ""}
            </span>
          </Row>
        ) : null}
        <Row label="Exit Criteria">
          {groups.required.length} required item{groups.required.length === 1 ? "" : "s"}
        </Row>
        <Row label="Health">
          {/*
            * The journey's own health, not a second opinion computed here.
            * The label is passed in from the one calculation, and the link
            * opens the same breakdown the rail used to print in full.
            */}
          {onHealthDetails ? (
            <button
              type="button"
              onClick={onHealthDetails}
              className="font-medium text-sky-700 hover:underline"
            >
              {healthLabel}
            </button>
          ) : (
            healthLabel
          )}
        </Row>
        {secondaryStatus ? (
          <Row label="Secondary Status">
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              {secondaryStatus}
            </span>
          </Row>
        ) : null}
        <Row label="Time in Stage">
          {clock.day} day{clock.day === 1 ? "" : "s"}
          {clock.targetDays && !clock.isOverTarget
            ? ` (${Math.round((clock.day / clock.targetDays) * 100)}%)`
            : ""}
        </Row>
        {clock.pausedDays > 0 ? (
          <Row label="Paused Time">
            {clock.pausedDays} day{clock.pausedDays === 1 ? "" : "s"}
          </Row>
        ) : null}
        {clock.pausedDays > 0 ? (
          <Row label="Counting Toward Target">
            {clock.effectiveDays} day{clock.effectiveDays === 1 ? "" : "s"}
          </Row>
        ) : null}
        {/*
          * The two numbers somebody working the stage actually acts on: what
          * is still in the way, and how long the client has had it.
          */}
        <Row label="Blocking Items">
          <span className={blockingItems > 0 ? "font-semibold text-rose-600" : undefined}>
            {blockingItems}
          </span>
        </Row>
        {waitingDays !== null ? (
          <Row label="Waiting on Client">
            <span className={waitingDays >= 3 ? "text-amber-700" : undefined}>
              {waitingDays} day{waitingDays === 1 ? "" : "s"}
            </span>
          </Row>
        ) : null}
        {waitingSince ? (
          <Row label="Waiting Since">{formatDate(waitingSince)}</Row>
        ) : null}
      </dl>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */
/* Journey health                                                             */
/* -------------------------------------------------------------------------- */

const ARC_TONE: Record<string, string> = {
  ON_TRACK: "text-emerald-500",
  WAITING: "text-amber-500",
  AT_RISK: "text-amber-500",
  BLOCKED: "text-rose-500",
};

/** A half dial, as the reference draws it, with the factors that moved it. */
export function JourneyHealthPanel({
  health,
  statusLabel,
  onAssess,
  onDetails,
}: {
  health: JourneyHealth;
  statusLabel: string;
  onAssess: () => void;
  onDetails: () => void;
}) {
  const radius = 46;
  const semicircle = Math.PI * radius;
  const filled = (health.score / 100) * semicircle;

  return (
    <Panel
      title="Journey Health"
      action={
        <button
          type="button"
          onClick={onDetails}
          className="flex items-center gap-0.5 text-[11px] font-medium text-indigo-600 hover:underline"
        >
          View details
          <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      }
    >
      <div className="flex items-center gap-3">
        <div className="relative h-[62px] w-[112px] shrink-0">
          <svg viewBox="0 0 112 62" className="h-full w-full">
            <path
              d={`M 10 56 A ${radius} ${radius} 0 0 1 102 56`}
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              className="stroke-slate-100"
            />
            <path
              d={`M 10 56 A ${radius} ${radius} 0 0 1 102 56`}
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${filled} ${semicircle}`}
              className={cn("stroke-current", ARC_TONE[health.status] ?? "text-slate-400")}
            />
          </svg>
          <span className="absolute inset-x-0 bottom-1 text-center">
            <span className="block text-2xl font-semibold leading-none tabular-nums text-slate-950">
              {health.score}
            </span>
            <span className="block text-[10px] text-slate-500">{statusLabel}</span>
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Main Factors
          </p>
          <ul className="mt-1 space-y-1">
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
/* Stage history                                                              */
/* -------------------------------------------------------------------------- */

/** The dot's colour says what kind of event it was, without a word for it. */
const HISTORY_TONE: Record<string, string> = {
  stage: "bg-sky-500",
  override: "bg-rose-500",
  blocker: "bg-amber-500",
  approval: "bg-emerald-500",
  asset: "bg-violet-500",
  milestone: "bg-slate-400",
  other: "bg-slate-300",
};

export interface HistoryEntry {
  id: string;
  label: string;
  at: string;
  actorName: string | null;
  kind: string;
}

/**
 * Recent journey events, newest first, down the page.
 *
 * This was four cards abreast. Read left to right, a sequence stops looking
 * like one: the eye has no reason to go in that order, and the fourth column
 * on a wide screen is as prominent as the first, so the newest event did not
 * read as the newest. A column reads in the order the events happened.
 *
 * Nothing is clickable, and that is deliberate rather than unfinished. The
 * query behind this returns only rows logged against the client itself, so
 * every event's "related record" is the client whose page you are already on.
 * Making them links would send somebody back where they started. The events
 * that do own a record - a defect, a task - are logged against that record and
 * are not in this feed.
 */
export function StageHistoryTimeline({
  entries,
  onViewAll,
}: {
  entries: HistoryEntry[];
  onViewAll: () => void;
}) {
  /* Five: enough to see a sequence, not enough to become the page. */
  const shown = entries.slice(0, 5);

  return (
    <Panel
      title="Stage History"
      action={
        <button
          type="button"
          onClick={onViewAll}
          className="flex items-center gap-0.5 text-[11px] font-medium text-indigo-600 hover:underline"
        >
          View full history
          <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      }
    >
      {shown.length === 0 ? (
        <p className="text-xs text-slate-500">Nothing has happened on this journey yet.</p>
      ) : (
        <ol className="space-y-0">
          {shown.map((entry, index) => {
            const last = index === shown.length - 1;

            return (
              <li key={entry.id} className="flex gap-2.5">
                {/*
                  * The rail: a dot, and a line that reaches the next one. The
                  * line is on the item above rather than between items, so the
                  * last event ends cleanly instead of trailing into nothing.
                  */}
                <div className="flex shrink-0 flex-col items-center">
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      HISTORY_TONE[entry.kind] ?? HISTORY_TONE.other,
                    )}
                    aria-hidden
                  />
                  {last ? null : <span className="w-px flex-1 bg-slate-200" aria-hidden />}
                </div>

                <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-3")}>
                  <p className="text-xs font-medium leading-4 text-slate-800">{entry.label}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-slate-400">
                    {formatDateTime(entry.at)}
                    {entry.actorName ? (
                      <>
                        {" "}
                        <span aria-hidden>·</span> by {entry.actorName}
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export function JourneyFooter({
  timezone,
  updatedAt,
  refreshing,
  onRefresh,
}: {
  timezone: string | null;
  updatedAt: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
      <span>All times shown in {timezone ?? "your local time"}</span>
      <span className="flex items-center gap-3">
        <span>Last updated {formatDateTime(updatedAt)}</span>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />
          Refresh
        </button>
      </span>
    </footer>
  );
}

export { ArrowRight };
