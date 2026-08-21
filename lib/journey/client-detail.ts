import {
  type JourneyAccount,
  type JourneyActivityEntry,
  type JourneyRequirement,
  daysBetween,
  deriveProgress,
  exitReadiness,
  stageAging,
} from "@/lib/journey/journey-board";

/**
 * What one client's journey page needs, and how it decides what to say.
 *
 * The page answers six questions in order - where are we, what happens next,
 * what is missing, who owns it, are the requirements done, can we advance -
 * and everything here exists to answer one of them from records that already
 * exist. Nothing is invented: where a figure is not recorded, the interface
 * says so rather than showing a plausible number.
 *
 * The account itself is the same JourneyAccount the board uses, so health,
 * progress and stage aging are the identical functions. This module only adds
 * the detail a single client needs and the board does not.
 */

export type FlagKind = "WAITING_ON_CLIENT" | "BLOCKED" | "REVISIONS_REQUIRED" | "PAUSED";

export const FLAG_LABELS: Record<FlagKind, string> = {
  WAITING_ON_CLIENT: "Waiting on Client",
  BLOCKED: "Blocked",
  REVISIONS_REQUIRED: "Revisions Required",
  PAUSED: "Paused",
};

export const FLAG_TONES: Record<FlagKind, "amber" | "rose" | "violet" | "slate"> = {
  WAITING_ON_CLIENT: "amber",
  BLOCKED: "rose",
  REVISIONS_REQUIRED: "violet",
  PAUSED: "slate",
};

export interface JourneyFlag {
  id: string;
  kind: FlagKind;
  reason: string;
  detail: string | null;
  responsibleParty: string | null;
  dueAt: string | null;
  round: number | null;
  raisedByName: string | null;
  raisedAt: string;
}

export interface DetailTask {
  id: string;
  title: string;
  status: string;
  dueDate: string;
  estimatedHours: number;
  actualHours: number | null;
  assigneeName: string | null;
}

export interface DetailContact {
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
}

export interface TimelineMilestone {
  id: string;
  name: string;
  dueAt: string;
  completed: boolean;
  /** The one the team is working towards now. */
  isCurrent: boolean;
  source: string;
}

export interface JourneyStageStep {
  id: string;
  name: string;
  position: number;
}

export interface JourneyClientDetail {
  account: JourneyAccount;
  /** Open secondary statuses, newest first. */
  flags: JourneyFlag[];
  tasks: DetailTask[];
  contacts: DetailContact[];
  milestones: TimelineMilestone[];
  activity: JourneyActivityEntry[];
  /**
   * Every live stage in order, for the timeline.
   *
   * The stored stages rather than the twelve-stage display grouping: the
   * timeline is showing this client's actual route, and operations add and
   * retire stages in the database without a deploy.
   */
  stages: JourneyStageStep[];

  projectStartDate: string | null;
  targetLaunchDate: string | null;
  renewalDate: string | null;

  canMove: boolean;
  canOverride: boolean;
  canManageFlags: boolean;
}

/* -------------------------------------------------------------------------- */
/* The stage clock                                                            */
/* -------------------------------------------------------------------------- */

export interface StageClock {
  enteredAt: string;
  day: number;
  targetDays: number | null;
  /** Days left inside the target. Negative once it is over. */
  remaining: number | null;
  isOverTarget: boolean;
  /** "Day 6 of 8", or "Day 6" when the stage has no target. */
  label: string;
  /** "2 days remaining" / "2 days over" / null when there is no target. */
  remainingLabel: string | null;
}

export function stageClock(account: JourneyAccount, now: Date): StageClock {
  const aging = stageAging(account, now);
  const target = aging.targetDays;
  const remaining = target === null ? null : target - aging.days;

  return {
    enteredAt: account.stageEnteredAt,
    day: aging.days,
    targetDays: target,
    remaining,
    isOverTarget: aging.isOverTarget,
    label: target === null ? `Day ${aging.days}` : `Day ${aging.days} of ${target}`,
    remainingLabel:
      remaining === null
        ? null
        : remaining >= 0
          ? `${remaining} day${remaining === 1 ? "" : "s"} remaining`
          : `${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? "" : "s"} over`,
  };
}

/* -------------------------------------------------------------------------- */
/* Requirements                                                               */
/* -------------------------------------------------------------------------- */

export interface RequirementGroups {
  required: JourneyRequirement[];
  optional: JourneyRequirement[];
  total: number;
  met: number;
  /** Unmet blocking requirements - what actually holds the stage shut. */
  outstanding: JourneyRequirement[];
}

/**
 * Required and optional, split by whether the gate actually blocks.
 *
 * isBlocking is already what the stage gate means by "required", so this reads
 * the existing column rather than adding a second notion of importance that
 * could disagree with the gate people are actually stopped by.
 */
export function requirementGroups(requirements: JourneyRequirement[]): RequirementGroups {
  const required = requirements.filter((requirement) => requirement.isBlocking);
  const optional = requirements.filter((requirement) => !requirement.isBlocking);

  return {
    required,
    optional,
    total: requirements.length,
    met: requirements.filter((requirement) => requirement.satisfied).length,
    outstanding: required.filter((requirement) => !requirement.satisfied),
  };
}

/* -------------------------------------------------------------------------- */
/* Work                                                                       */
/* -------------------------------------------------------------------------- */

const OPEN_STATUSES = new Set([
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "WAITING_CLIENT",
  "BLOCKED",
  "NEEDS_REVIEW",
  "REVISION_REQUIRED",
]);

const DONE_STATUSES = new Set(["APPROVED", "DONE"]);

export interface WorkSummary {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
  todo: number;
  needsReview: number;
}

export function workSummary(tasks: DetailTask[]): WorkSummary {
  return {
    total: tasks.length,
    completed: tasks.filter((task) => DONE_STATUSES.has(task.status)).length,
    inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    blocked: tasks.filter((task) => task.status === "BLOCKED").length,
    todo: tasks.filter((task) => task.status === "TODO" || task.status === "BACKLOG").length,
    needsReview: tasks.filter(
      (task) => task.status === "NEEDS_REVIEW" || task.status === "REVISION_REQUIRED",
    ).length,
  };
}

/**
 * How far through a task is, or null when nobody has logged any time.
 *
 * Hours booked against hours estimated is the only completion signal the task
 * record actually carries - there is no percentage field. Where no time has
 * been logged this returns null and the interface shows the status alone,
 * because a progress bar invented from the status would be a number the team
 * never entered and would then start reporting back to them as fact.
 */
export function taskProgress(task: DetailTask): number | null {
  if (DONE_STATUSES.has(task.status)) return 100;
  if (task.actualHours === null || task.estimatedHours <= 0) return null;

  return Math.max(0, Math.min(99, Math.round((task.actualHours / task.estimatedHours) * 100)));
}

/** The handful worth showing: blocked first, then in progress, then the rest. */
export function focusTasks(tasks: DetailTask[], now: Date, limit = 3): DetailTask[] {
  const weight = (task: DetailTask) => {
    if (task.status === "BLOCKED") return 4;
    if (new Date(task.dueDate) < now && OPEN_STATUSES.has(task.status)) return 3;
    if (task.status === "IN_PROGRESS") return 2;
    if (OPEN_STATUSES.has(task.status)) return 1;
    return 0;
  };

  return [...tasks]
    .filter((task) => !DONE_STATUSES.has(task.status))
    .sort(
      (a, b) =>
        weight(b) - weight(a)
        || new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    )
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* What happens next                                                          */
/* -------------------------------------------------------------------------- */

export type NextStepKind =
  | "resolve-blocker"
  | "chase-client"
  | "complete-requirements"
  | "continue-work"
  | "ready-to-advance"
  | "journey-complete";

export interface NextStep {
  kind: NextStepKind;
  /** The button on the What Happens Next card. */
  action: string;
  /** One line under the heading, saying what the step actually is. */
  detail: string;
}

/**
 * The single next operational step, and the button that starts it.
 *
 * Ordered by what would actually stop a project manager first. A blocked
 * account cannot be progressed by finishing requirements, and an account
 * waiting on the client cannot be progressed by the agency at all - so those
 * come before "complete the requirements", which comes before ordinary work.
 * Only one thing is ever offered, because the point of the card is to remove
 * the decision about where to start.
 */
export function nextStep(detail: JourneyClientDetail): NextStep {
  const { account } = detail;

  if (!account.nextStageId) {
    return {
      kind: "journey-complete",
      action: "Open Client",
      detail: "This account is at the end of the journey.",
    };
  }

  const blocker = detail.flags.find((flag) => flag.kind === "BLOCKED");

  if (blocker || account.currentBlocker?.trim() || account.blockedTaskCount > 0) {
    return {
      kind: "resolve-blocker",
      action: "Resolve Blocker",
      detail:
        blocker?.reason
        ?? account.currentBlocker?.trim()
        ?? `${account.blockedTaskCount} task${account.blockedTaskCount === 1 ? " is" : "s are"} blocked.`,
    };
  }

  const waiting = detail.flags.find((flag) => flag.kind === "WAITING_ON_CLIENT");

  if (waiting) {
    return {
      kind: "chase-client",
      action: "Send Follow-Up",
      detail: waiting.detail ?? waiting.reason,
    };
  }

  const readiness = exitReadiness(account);

  if (!readiness.canAdvance) {
    const count = readiness.blocking.length;

    return {
      kind: "complete-requirements",
      action: "Complete Requirements",
      detail: `${count} requirement${count === 1 ? "" : "s"} still to finish before ${account.nextStageName}.`,
    };
  }

  const openWork = detail.tasks.filter((task) => OPEN_STATUSES.has(task.status)).length;

  if (openWork > 0) {
    return {
      kind: "continue-work",
      action: "Continue Work",
      detail: `${openWork} task${openWork === 1 ? "" : "s"} still open in this stage.`,
    };
  }

  return {
    kind: "ready-to-advance",
    action: `Move to ${account.nextStageName}`,
    detail: "All requirements for this stage are complete.",
  };
}

/** True when the page should show the green Ready to Advance state. */
export function isReadyToAdvance(detail: JourneyClientDetail): boolean {
  return nextStep(detail).kind === "ready-to-advance";
}

/* -------------------------------------------------------------------------- */
/* Needs attention, for one client                                            */
/* -------------------------------------------------------------------------- */

export interface AttentionCard {
  key: string;
  title: string;
  lines: string[];
  /** The button, when there is one thing to do about it. */
  action: string | null;
  tone: "amber" | "rose" | "violet" | "slate";
}

/**
 * Everything wrong with this one account, worst first.
 *
 * Raised flags come first because somebody deliberately recorded them, then
 * the things derived from dates that have passed. An account with nothing
 * wrong returns an empty list and the page shows a single quiet line rather
 * than an empty panel.
 */
export function attentionCards(detail: JourneyClientDetail, now: Date): AttentionCard[] {
  const { account } = detail;
  const cards: AttentionCard[] = [];

  for (const flag of detail.flags) {
    const since = Math.abs(daysBetween(new Date(flag.raisedAt), now));
    const lines = [
      `${flag.kind === "PAUSED" ? "Paused" : "Waiting"} since ${formatDay(flag.raisedAt)}${
        since > 0 ? ` (${since} day${since === 1 ? "" : "s"})` : ""
      }`,
    ];

    if (flag.responsibleParty) lines.push(`Responsible: ${flag.responsibleParty}`);

    if (flag.dueAt) {
      const days = daysBetween(now, new Date(flag.dueAt));

      lines.push(
        `Follow-up due: ${days === 0 ? "Today" : days < 0 ? `${Math.abs(days)} days overdue` : formatDay(flag.dueAt)}`,
      );
    }

    if (flag.round !== null) lines.push(`Revision round ${flag.round}`);

    cards.push({
      key: `flag-${flag.id}`,
      title: flag.reason,
      lines,
      action:
        flag.kind === "WAITING_ON_CLIENT"
          ? "Send Follow-Up"
          : flag.kind === "PAUSED"
            ? "Resume Journey"
            : "Mark Resolved",
      tone: FLAG_TONES[flag.kind],
    });
  }

  const overdueTasks = detail.tasks.filter(
    (task) => OPEN_STATUSES.has(task.status) && new Date(task.dueDate) < now,
  );

  if (overdueTasks.length > 0) {
    const worst = overdueTasks.reduce((oldest, candidate) =>
      new Date(candidate.dueDate) < new Date(oldest.dueDate) ? candidate : oldest,
    );
    const late = Math.abs(daysBetween(new Date(worst.dueDate), now));

    cards.push({
      key: "overdue-tasks",
      title: `${overdueTasks.length} task${overdueTasks.length === 1 ? "" : "s"} overdue`,
      lines: [worst.title, `${late} day${late === 1 ? "" : "s"} overdue`],
      action: "Open Task",
      tone: "rose",
    });
  }

  const aging = stageAging(account, now);

  if (aging.isOverTarget) {
    cards.push({
      key: "stage-overdue",
      title: "Stage over target",
      lines: [
        `${aging.overBy} day${aging.overBy === 1 ? "" : "s"} past the ${aging.targetDays}-day target`,
        `Entered ${formatDay(account.stageEnteredAt)}`,
      ],
      action: null,
      tone: "amber",
    });
  }

  const overdueMilestones = detail.milestones.filter(
    (milestone) =>
      !milestone.completed
      && milestone.source !== "stage-target"
      && new Date(milestone.dueAt) < now,
  );

  if (overdueMilestones.length > 0) {
    cards.push({
      key: "overdue-milestones",
      title: `${overdueMilestones.length} milestone${
        overdueMilestones.length === 1 ? "" : "s"
      } overdue`,
      lines: overdueMilestones.slice(0, 2).map(
        (milestone) => `${milestone.name} - due ${formatDay(milestone.dueAt)}`,
      ),
      action: null,
      tone: "rose",
    });
  }

  if (account.criticalAccessMissing > 0) {
    cards.push({
      key: "missing-access",
      title: `${account.criticalAccessMissing} critical access record${
        account.criticalAccessMissing === 1 ? "" : "s"
      } outstanding`,
      lines: ["The agency still cannot get in."],
      action: "Open Access",
      tone: "amber",
    });
  }

  return cards;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function formatDay(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDay(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Today, 2:15 PM" / "Yesterday, 4:30 PM" / "Aug 18, 11:10 AM". */
export function activityStamp(value: string, now: Date): string {
  const when = new Date(value);
  const days = daysBetween(when, now);
  const time = when.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;

  return `${formatShortDay(when)}, ${time}`;
}

export { deriveProgress };
