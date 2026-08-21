"use client";

import {
  ArrowRight,
  Compass,
  GitBranch,
  Calendar,
  Check,
  CircleCheck,
  ClipboardList,
  Flag,
  ListChecks,
  Target,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  type DetailTask,
  type JourneyClientDetail,
  type NextStep,
  type TimelineMilestone,
  formatDay,
  formatShortDay,
  focusTasks,
  requirementGroups,
  stageClock,
  taskProgress,
  workSummary,
} from "@/lib/journey/client-detail";
import {
  type JourneyRequirement,
  deriveProgress,
  explainHealth,
  HEALTH_COLORS,
  HEALTH_LABELS,
} from "@/lib/journey/journey-board";
import { journeyStageForStoredStage } from "@/lib/journey/phases";
import {
  stageFocusFor,
  stageFocusHref,
} from "@/lib/journey/stage-focus";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Shared chrome                                                              */
/* -------------------------------------------------------------------------- */

export function Card({
  icon: Icon,
  title,
  action,
  className,
  bodyClassName,
  children,
}: {
  icon: typeof Flag;
  title: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          {title}
        </h2>
        {action}
      </header>
      <div className={cn("flex-1 p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-xs text-slate-400">{children}</p>;
}

/** One line of a two-column label/value list. */
function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[5px]">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-right text-xs font-medium text-slate-800">{value}</span>
    </div>
  );
}

function Tick({ done }: { done: boolean }) {
  return done ? (
    <span
      className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
      aria-hidden
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3} />
    </span>
  ) : (
    <span
      className="mt-px inline-block h-4 w-4 shrink-0 rounded-full border-[1.5px] border-slate-300"
      aria-hidden
    />
  );
}

/* -------------------------------------------------------------------------- */
/* What happens next                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The card the page is built around.
 *
 * It answers one question - what is the next operational step - and offers the
 * single button that starts it. Everything else on the page is context for
 * this. When the account is ready to move it turns green and becomes the
 * advance control, so progression is never something to go hunting for.
 */
/**
 * The single thing to do next.
 *
 * Deliberately framed around the current stage rather than the next one. A
 * card headed with the stage the client is moving *to* reads like a status
 * label; what a project manager opening this page actually needs is the list
 * of things standing between here and there, and a button that opens them.
 *
 * Flips to a ready state once nothing blocking is outstanding, so the same
 * card carries both halves of the job - finish the work, then move the client
 * - without the page growing a second button that is wrong most of the time.
 */
export function NextBestActionCard({
  detail,
  step,
  now,
  onPrimary,
  onAdvance,
}: {
  detail: JourneyClientDetail;
  step: NextStep;
  now: Date;
  onPrimary: () => void;
  onAdvance: () => void;
}) {
  const { account } = detail;
  const groups = requirementGroups(account.exitCriteria);
  const ready = step.kind === "ready-to-advance";
  const atEnd = !account.nextStageName;

  const shown = [...account.exitCriteria]
    .sort((a, b) => Number(b.satisfied) - Number(a.satisfied))
    .slice(0, 6);

  return (
    <Card
      icon={ready ? Flag : ListChecks}
      title="Next Best Action"
      className={cn(ready && "border-emerald-300 ring-1 ring-emerald-100")}
      action={
        groups.total > 0 && !ready ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            {groups.met} of {groups.total} complete
          </span>
        ) : null
      }
    >
      <h3 className="text-lg font-semibold leading-tight text-slate-950">
        {atEnd
          ? "Journey complete"
          : ready
            ? "Ready to advance"
            : `Complete ${account.stageName} requirements`}
      </h3>

      <p className="mt-1 text-xs leading-5 text-slate-500">
        {atEnd
          ? "This account has reached the end of the journey."
          : ready
            ? `All required ${account.stageName} items are complete.`
            : `Finish the items below to move this client to ${account.nextStageName}.`}
      </p>

      {!atEnd ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            Target:{" "}
            <span className="font-medium text-slate-700">
              {account.nextActionDueAt
                ? formatDay(account.nextActionDueAt)
                : stageTargetDate(detail, now)}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            Owner:{" "}
            <span className="font-medium text-slate-700">
              {account.projectManagerName ?? "Unassigned"}
            </span>
          </span>
        </div>
      ) : null}

      {!ready && shown.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {shown.map((requirement) => (
            <li key={requirement.key} className="flex items-start gap-2">
              <Tick done={requirement.satisfied} />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-xs leading-4",
                    requirement.satisfied ? "text-slate-400" : "text-slate-700",
                  )}
                >
                  {requirement.label}
                </span>
              </span>
              {!requirement.satisfied && requirement.isBlocking ? (
                <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                  Blocks stage move
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!atEnd ? (
        <div className="mt-4 flex justify-end">
          {ready ? (
            <Button size="sm" className="gap-1.5" onClick={onAdvance}>
              Move to {account.nextStageName}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={onPrimary}>
              Complete Requirements
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function stageTargetDate(detail: JourneyClientDetail, now: Date) {
  const clock = stageClock(detail.account, now);

  if (clock.targetDays === null) return "No target set";

  const target = new Date(detail.account.stageEnteredAt);

  target.setDate(target.getDate() + clock.targetDays);

  return formatDay(target);
}

/* -------------------------------------------------------------------------- */
/* Current stage                                                              */
/* -------------------------------------------------------------------------- */

export function CurrentStageCard({
  detail,
  now,
  onExplainHealth,
}: {
  detail: JourneyClientDetail;
  now: Date;
  onExplainHealth: () => void;
}) {
  const { account } = detail;
  const clock = stageClock(account, now);
  const progress = deriveProgress(account);
  /*
   * The exit criteria, not the entry gates.
   *
   * A stage's own requirements are what had to hold to get in, so they read
   * "3 of 3 complete" for the entire time an account sits there - true, and
   * useless. What a project manager is working through is what has to hold to
   * get out, which is the next stage's gate. Both cards read the same list so
   * the page cannot say "1 remaining" in one place and "all complete" in
   * another.
   */
  const groups = requirementGroups(account.exitCriteria);
  const work = workSummary(detail.tasks);
  const { health } = explainHealth(account, now);

  return (
    <Card icon={ClipboardList} title="Current Stage">
      <h3 className="text-base font-semibold leading-tight text-slate-950">
        {account.stageName}
      </h3>

      <div className="mt-2 divide-y divide-slate-100">
        <Row label="Entered" value={formatDay(account.stageEnteredAt)} />
        <Row
          label="Target Duration"
          value={clock.targetDays === null ? "No target" : `${clock.targetDays} days`}
        />
        <Row label="Days in Stage" value={`${clock.day} days`} />
        <Row
          label={clock.isOverTarget ? "Days Over" : "Days Remaining"}
          value={
            clock.remainingLabel === null ? (
              "-"
            ) : (
              <span className={cn(clock.isOverTarget && "text-rose-600")}>
                {Math.abs(clock.remaining ?? 0)} days
              </span>
            )
          }
        />
      </div>

      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-slate-500">Progress</span>
            <span className="text-xs font-semibold text-slate-900">{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <Row
          label="Requirements"
          value={`${groups.met} / ${groups.total} complete`}
        />
        <Row label="Tasks" value={`${work.completed} / ${work.total} complete`} />

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-slate-500">Health</span>
          <button
            type="button"
            onClick={onExplainHealth}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: HEALTH_COLORS[health] }}
              aria-hidden
            />
            {HEALTH_LABELS[health]}
            <span
              className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 text-[9px] text-slate-500"
              aria-hidden
            >
              i
            </span>
          </button>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Stage requirements                                                         */
/* -------------------------------------------------------------------------- */

export function StageRequirementsCard({
  detail,
  expanded,
  onToggle,
}: {
  detail: JourneyClientDetail;
  expanded: boolean;
  onToggle: () => void;
}) {
  const groups = requirementGroups(detail.account.exitCriteria);
  const rows = [...groups.required, ...groups.optional];
  const limit = expanded ? rows.length : 8;
  const shown = rows.slice(0, limit);

  // A client-owned requirement on an account that is waiting on the client is
  // not "missing" - somebody has already asked, and the page should say so
  // rather than implying nobody has done anything.
  // detail.flags carries only the live ones, so presence is enough.
  const waitingOnClient = detail.flags.some((flag) => flag.kind === "WAITING_ON_CLIENT");

  const statusOf = (requirement: JourneyRequirement) => {
    if (requirement.satisfied) {
      return { label: "Complete", tone: "bg-emerald-50 text-emerald-700" };
    }

    if (waitingOnClient && requirement.owner === "Client") {
      return { label: "Waiting on Client", tone: "bg-amber-50 text-amber-700" };
    }

    return requirement.isBlocking
      ? { label: "Missing", tone: "bg-rose-50 text-rose-700" }
      : { label: "Pending", tone: "bg-amber-50 text-amber-700" };
  };

  return (
    <Card
      icon={ListChecks}
      title="Stage Requirements"
      action={
        groups.total > 0 ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              groups.outstanding.length === 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-100 text-slate-600",
            )}
          >
            {groups.met} of {groups.total} complete
          </span>
        ) : null
      }
    >
      {groups.total === 0 ? (
        <Quiet>
          {detail.account.nextStageName
            ? `Nothing gates the move into ${detail.account.nextStageName}.`
            : "This account is at the end of the journey."}
        </Quiet>
      ) : (
        <>
          {/* The table scrolls inside its own box rather than taking the page
              sideways on a phone. */}
          <div className="w-full min-w-0 max-w-full overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="pb-2 pr-3 font-semibold">Requirement</th>
                  <th className="pb-2 pr-3 font-semibold">Owner</th>
                  <th className="pb-2 pr-3 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Impact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {shown.map((requirement) => {
                  const status = statusOf(requirement);

                  return (
                    <tr key={requirement.key} className="align-top">
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            "block text-xs leading-4",
                            requirement.satisfied ? "text-slate-400" : "text-slate-700",
                          )}
                        >
                          {requirement.label}
                        </span>
                        {!requirement.satisfied && requirement.reason ? (
                          <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">
                            {requirement.reason}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-[11px] text-slate-500">
                        {requirement.owner}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            status.tone,
                          )}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="py-2">
                        <span
                          className={cn(
                            "text-[11px] font-medium",
                            requirement.isBlocking ? "text-rose-600" : "text-slate-400",
                          )}
                        >
                          {requirement.isBlocking ? "Blocks" : "Recommended"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length > 8 ? (
            <button
              type="button"
              onClick={onToggle}
              className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              {expanded ? "Show fewer" : `View All Requirements (${rows.length})`}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Work                                                                       */
/* -------------------------------------------------------------------------- */

const TASK_STATUS_TONE: Record<string, string> = {
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  BLOCKED: "bg-amber-50 text-amber-700",
  NEEDS_REVIEW: "bg-violet-50 text-violet-700",
  REVISION_REQUIRED: "bg-violet-50 text-violet-700",
  WAITING_CLIENT: "bg-amber-50 text-amber-700",
  TODO: "bg-slate-100 text-slate-600",
  BACKLOG: "bg-slate-100 text-slate-600",
};

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function TaskRow({ task }: { task: DetailTask }) {
  const progress = taskProgress(task);

  return (
    <li className="py-2">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
          {task.title}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
            TASK_STATUS_TONE[task.status] ?? "bg-slate-100 text-slate-600",
          )}
        >
          {statusLabel(task.status)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
          {/*
            * Only drawn when hours have actually been logged. There is no
            * percentage field on a task, so a bar with no time behind it would
            * be a number nobody entered.
            */}
          {progress !== null ? (
            <div
              className={cn(
                "h-full rounded-full",
                task.status === "BLOCKED" ? "bg-amber-500" : "bg-sky-500",
              )}
              style={{ width: `${progress}%` }}
            />
          ) : null}
        </div>
        <span className="w-14 shrink-0 text-right text-[10px] text-slate-400">
          {progress === null ? "No time logged" : `${progress}%`}
        </span>
      </div>
    </li>
  );
}

export function WorkSummaryCard({
  detail,
  now,
  clientId,
}: {
  detail: JourneyClientDetail;
  now: Date;
  clientId: string;
}) {
  const work = workSummary(detail.tasks);
  const focus = focusTasks(detail.tasks, now);

  const tiles = [
    { label: "Completed", value: work.completed, tone: "text-emerald-600 bg-emerald-50" },
    { label: "In Progress", value: work.inProgress, tone: "text-sky-600 bg-sky-50" },
    { label: "Blocked", value: work.blocked, tone: "text-amber-600 bg-amber-50" },
    { label: "To Do", value: work.todo, tone: "text-slate-500 bg-slate-50" },
  ];

  return (
    <Card
      icon={ClipboardList}
      title="Stage Work Summary"
      action={
        <span className="text-[11px] font-medium text-slate-500">
          {work.total} task{work.total === 1 ? "" : "s"}
        </span>
      }
    >
      {work.total === 0 ? (
        <Quiet>No active work for this stage.</Quiet>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {tiles.map((tile) => (
              <div
                key={tile.label}
                className={cn("rounded-lg px-2 py-2 text-center", tile.tone)}
              >
                <p className="text-base font-semibold leading-none">{tile.value}</p>
                <p className="mt-1 text-[10px] leading-3 opacity-80">{tile.label}</p>
              </div>
            ))}
          </div>

          {focus.length > 0 ? (
            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {focus.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          ) : (
            <Quiet>Everything in this stage is finished.</Quiet>
          )}

          <Link
            href={`/clients/${clientId}?tab=tasks`}
            className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            View All Tasks in My Work
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Milestones                                                                 */
/* -------------------------------------------------------------------------- */

function MilestoneNode({ milestone }: { milestone: TimelineMilestone }) {
  const state = milestone.completed
    ? "done"
    : milestone.isCurrent
      ? "current"
      : "upcoming";

  return (
    <li className="flex min-w-[7.5rem] flex-1 flex-col items-center text-center">
      <span
        className={cn(
          "relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white",
          state === "done" && "border-emerald-500 bg-emerald-500 text-white",
          state === "current" && "border-sky-500 text-sky-600 ring-4 ring-sky-100",
          state === "upcoming" && "border-slate-200 text-slate-300",
        )}
      >
        {state === "done" ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        ) : state === "current" ? (
          <span className="h-2 w-2 rounded-full bg-sky-500" aria-hidden />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300" aria-hidden />
        )}
      </span>

      <p
        className={cn(
          "mt-2 text-[11px] font-semibold leading-tight",
          state === "upcoming" ? "text-slate-400" : "text-slate-800",
        )}
      >
        {milestone.name}
      </p>
      <p className="mt-0.5 text-[10px] text-slate-400">
        {formatShortDay(milestone.dueAt)}
      </p>
      {state !== "done" ? (
        <span
          className={cn(
            "mt-1 rounded px-1.5 py-0.5 text-[9px] font-semibold",
            state === "current"
              ? "bg-sky-50 text-sky-700"
              : "bg-slate-50 text-slate-400",
          )}
        >
          {state === "current" ? "In Progress" : "Upcoming"}
        </span>
      ) : null}
    </li>
  );
}

/**
 * The schedule as a rail.
 *
 * Horizontal on a wide screen and vertical on a phone, because a horizontal
 * rail on a 375px screen is either unreadable or a sideways scroll, and the
 * whole point is to take it in at a glance.
 */
export function MilestonesCard({ milestones }: { milestones: TimelineMilestone[] }) {
  const shown = milestones.slice(0, 7);

  return (
    <Card icon={CircleCheck} title="Next Milestone">
      {shown.length === 0 ? (
        <Quiet>No upcoming milestone scheduled.</Quiet>
      ) : (
        <>
          <div className="relative hidden overflow-x-auto pb-1 sm:block">
            <ol className="relative flex min-w-full justify-between gap-2">
              <span
                className="absolute left-[3.75rem] right-[3.75rem] top-[0.85rem] h-px bg-slate-200"
                aria-hidden
              />
              {shown.map((milestone) => (
                <MilestoneNode key={milestone.id} milestone={milestone} />
              ))}
            </ol>
          </div>

          <ol className="space-y-3 sm:hidden">
            {shown.map((milestone) => (
              <li key={milestone.id} className="flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-white",
                    milestone.completed && "border-emerald-500 bg-emerald-500 text-white",
                    !milestone.completed
                      && milestone.isCurrent
                      && "border-sky-500 ring-4 ring-sky-100",
                    !milestone.completed && !milestone.isCurrent && "border-slate-200",
                  )}
                  aria-hidden
                >
                  {milestone.completed ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-slate-800">
                    {milestone.name}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    {formatShortDay(milestone.dueAt)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Journey timeline                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The client's route, top to bottom.
 *
 * A vertical list rather than a row of pills. Sixteen stages across the width
 * of a card gives sixteen unreadable slivers, and the question this answers -
 * "how far along is this, and what is left" - is a reading task, not a
 * glancing one.
 *
 * Stages come from the database rather than the twelve-stage display grouping,
 * because operations add and retire stages without a deploy and the timeline
 * has to show the route this client is actually on.
 */
export function JourneyTimelineCard({
  detail,
  now,
  expanded,
  onToggle,
}: {
  detail: JourneyClientDetail;
  /* Passed in rather than read here: Date.now() during render is impure and
     gives the server and the client two different answers. */
  now: Date;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { account, stages } = detail;
  const currentIndex = stages.findIndex((stage) => stage.id === account.stageId);

  if (stages.length === 0) {
    return (
      <Card icon={GitBranch} title="Journey Timeline">
        <Quiet>No journey stages are configured yet.</Quiet>
      </Card>
    );
  }

  /*
   * Collapsed, the list is centred on where the client actually is: a couple
   * of stages behind for context and the road ahead. Showing the first eight
   * of sixteen would hide the current stage on any late-stage account, which
   * is the one row that has to be visible.
   */
  const shown = expanded
    ? stages
    : stages.slice(Math.max(0, currentIndex - 2), Math.max(0, currentIndex - 2) + 8);

  return (
    <Card
      icon={GitBranch}
      title="Journey Timeline"
      action={
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          {currentIndex + 1} of {stages.length}
        </span>
      }
    >
      <ol className="space-y-0">
        {shown.map((stage) => {
          const index = stages.indexOf(stage);
          const done = currentIndex >= 0 && index < currentIndex;
          const current = index === currentIndex;
          const last = stage === shown[shown.length - 1];

          return (
            <li key={stage.id} className="flex gap-3">
              {/* The rail: a dot per stage, joined by a line that stops at the
                  final row so it does not dangle. */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "mt-1.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2",
                    done && "border-emerald-500 bg-emerald-500",
                    current && "border-sky-500 bg-white ring-4 ring-sky-100",
                    !done && !current && "border-slate-200 bg-white",
                  )}
                >
                  {done ? <Check className="h-2 w-2 text-white" aria-hidden /> : null}
                </span>
                {!last ? (
                  <span
                    className={cn(
                      "w-0.5 flex-1",
                      done ? "bg-emerald-200" : "bg-slate-100",
                    )}
                  />
                ) : null}
              </div>

              <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-3")}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span
                    className={cn(
                      "text-xs leading-5",
                      current && "font-semibold text-slate-950",
                      done && "text-slate-500",
                      !done && !current && "text-slate-400",
                    )}
                  >
                    {stage.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {current
                      ? `Current · day ${Math.max(
                          1,
                          Math.ceil(
                            (now.getTime() - new Date(account.stageEnteredAt).getTime())
                              / 86_400_000,
                          ),
                        )}`
                      : done
                        ? "Complete"
                        : "Upcoming"}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {stages.length > shown.length || expanded ? (
        <button
          type="button"
          onClick={onToggle}
          className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          {expanded ? "Show fewer" : "View Full Journey"}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Stage focus                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What this stage is for, and where the work happens.
 *
 * The rest of the page is the same shape at every stage - requirements, work,
 * attention - which is what makes it learnable. This card is the part that
 * changes, so somebody landing on an account in Internal QA sees defects and
 * checklists rather than the onboarding language they saw last week.
 *
 * The links go to the client record's own tabs. Journey summarises delivery;
 * it does not host a second copy of the intake form, the access register or
 * the QA plans.
 */
export function StageFocusCard({ detail }: { detail: JourneyClientDetail }) {
  const { account } = detail;
  const stage = journeyStageForStoredStage(account.stageKey, account.stagePosition);
  const focus = stageFocusFor(stage.key);

  return (
    <Card icon={Compass} title={`Focus: ${stage.label}`}>
      <p className="text-xs leading-5 text-slate-600">{focus.purpose}</p>

      <ul className="mt-3 space-y-1.5">
        {focus.watchFor.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300"
            />
            <span className="text-xs leading-5 text-slate-600">{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        {focus.links.map((link) => (
          <Link key={link.tab + link.label} href={stageFocusHref(link, account.id)}>
            <Button size="sm" variant="secondary" className="gap-1.5">
              {link.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </Link>
        ))}
      </div>
    </Card>
  );
}
