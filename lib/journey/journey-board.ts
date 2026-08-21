import type { RequirementOwner } from "@/lib/journey/stage-requirements";
import {
  JOURNEY_PHASES,
  type JourneyStage,
  type PhaseKey,
  TOTAL_JOURNEY_STAGES,
  journeyStageForStoredStage,
} from "@/lib/journey/phases";

/**
 * Everything the Journey board derives, and nothing it stores.
 *
 * Health, progress, stage aging, attention and milestone urgency are all
 * computed here from records that already exist. None of them is a column.
 * The reason is the one that keeps biting: a stored judgement and the records
 * behind it drift apart the moment somebody forgets to update one of them, and
 * then the board is confidently wrong. A derived value cannot go stale.
 *
 * Every function takes `now` explicitly so the same input always produces the
 * same output under test.
 */

/** The four states delivery health may take. */
export type JourneyHealth = "ON_TRACK" | "WAITING" | "AT_RISK" | "BLOCKED";

export const HEALTH_LABELS: Record<JourneyHealth, string> = {
  ON_TRACK: "On Track",
  WAITING: "Waiting",
  AT_RISK: "At Risk",
  BLOCKED: "Blocked",
};

export const HEALTH_TONES: Record<JourneyHealth, "emerald" | "amber" | "rose" | "slate"> = {
  ON_TRACK: "emerald",
  WAITING: "amber",
  AT_RISK: "rose",
  BLOCKED: "slate",
};

/** Dot colours for the health donut and the card indicators. */
export const HEALTH_COLORS: Record<JourneyHealth, string> = {
  ON_TRACK: "#10b981",
  WAITING: "#f59e0b",
  AT_RISK: "#f43f5e",
  BLOCKED: "#64748b",
};

export const HEALTH_ORDER: JourneyHealth[] = ["ON_TRACK", "WAITING", "AT_RISK", "BLOCKED"];

/** How far ahead a renewal starts mattering. */
export const RENEWAL_HORIZON_DAYS = 30;

/** How far ahead a launch counts as launching soon. */
export const LAUNCH_HORIZON_DAYS = 14;

/** How long an account may go quiet before somebody should chase it. */
export const CLIENT_QUIET_DAYS = 7;

/** Intake states that mean the form is still sitting with the client. */
export const INTAKE_WITH_CLIENT = ["SENT", "VIEWED", "PARTIALLY_COMPLETED"];

export interface JourneyRequirement {
  key: string;
  label: string;
  /** The seat responsible, from the requirement catalogue. */
  owner: RequirementOwner;
  isBlocking: boolean;
  satisfied: boolean;
  reason: string | null;
}

export interface JourneyMilestone {
  id: string;
  clientId: string;
  companyName: string;
  /** What is due: a project milestone, a launch, a renewal, a stage target. */
  name: string;
  source: "milestone" | "launch" | "renewal" | "next-action" | "stage-target";
  dueAt: string;
  completed: boolean;
}

export interface JourneyHistoryEntry {
  id: string;
  fromStageName: string | null;
  toStageName: string;
  changedByName: string | null;
  changedAt: string;
  note: string | null;
  wasOverridden: boolean;
  overrideReason: string | null;
}

export interface JourneyActivityEntry {
  id: string;
  clientId: string | null;
  companyName: string | null;
  action: string;
  actorName: string | null;
  createdAt: string;
  kind: "stage" | "override" | "blocker" | "approval" | "asset" | "milestone" | "other";
}

/** One account on the board. Dates are ISO strings so this crosses to the client. */
export interface JourneyAccount {
  id: string;
  companyName: string;
  clientName: string;
  status: string;
  /** The stored HealthStatus enum. An input to health, never the answer. */
  storedHealth: string;
  serviceType: string;
  services: string[];

  stageId: string;
  /** The exact stored stage. This is what the interface names. */
  stageName: string;
  stageKey: string | null;
  stageColor: string;
  stagePosition: number;
  isStageDeprecated: boolean;
  stageEnteredAt: string;
  /** Expected days in the stored stage, from PipelineStage.slaDays. */
  stageTargetDays: number | null;

  ownerId: string | null;
  ownerName: string | null;
  projectManagerName: string | null;

  currentBlocker: string | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  lastClientUpdateAt: string | null;
  renewalDate: string | null;
  contractEndDate: string | null;
  launchDate: string | null;

  openTaskCount: number;
  completedTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  waitingTaskCount: number;
  reviewTaskCount: number;
  inProgressTaskCount: number;
  criticalAccessMissing: number;
  openDefectCount: number;
  awaitingReviewCount: number;
  intakeStatus: string | null;
  /** The most recent recorded satisfaction score, when one exists. */
  satisfactionScore: number | null;

  /** Gates on the stage the account is in now. */
  requirements: JourneyRequirement[];
  /** Gates on the next stage - what must hold before it can advance. */
  exitCriteria: JourneyRequirement[];
  nextStageId: string | null;
  nextStageName: string | null;

  milestones: JourneyMilestone[];
  history: JourneyHistoryEntry[];
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

export function journeyStageOf(account: JourneyAccount): JourneyStage {
  return journeyStageForStoredStage(account.stageKey, account.stagePosition);
}

export function phaseOf(account: JourneyAccount): PhaseKey {
  return journeyStageOf(account).phase;
}

/** Stored stages that mean the journey is finished. */
const TERMINAL_STAGE_KEYS = new Set(["project_completed", "archived", "completed"]);

export function isTerminal(account: JourneyAccount) {
  return account.stageKey !== null && TERMINAL_STAGE_KEYS.has(account.stageKey);
}

export function isActiveAccount(account: JourneyAccount) {
  return (
    !isTerminal(account) && account.status !== "COMPLETED" && account.status !== "ON_HOLD"
  );
}

/* -------------------------------------------------------------------------- */
/* Stage aging                                                                */
/* -------------------------------------------------------------------------- */

export interface StageAging {
  days: number;
  /** The expected duration, from the stored stage or the canonical fallback. */
  targetDays: number | null;
  /** Days past target. Zero when inside it, or when no target is configured. */
  overBy: number;
  isOverTarget: boolean;
  /** "Day 3 in stage" or "2 days over target". */
  label: string;
}

export function stageAging(account: JourneyAccount, now: Date): StageAging {
  const days = Math.max(0, daysBetween(new Date(account.stageEnteredAt), now));

  // The stored slaDays wins so operations can retune a stage without a deploy;
  // the canonical fallback only fills in where a stage has none configured.
  const targetDays = account.stageTargetDays ?? journeyStageOf(account).fallbackTargetDays;

  const overBy = targetDays === null ? 0 : Math.max(0, days - targetDays);
  const isOverTarget = overBy > 0;

  return {
    days,
    targetDays,
    overBy,
    isOverTarget,
    label: isOverTarget
      ? `${overBy} day${overBy === 1 ? "" : "s"} over target`
      : `Day ${days} in stage`,
  };
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Is the ball with the client right now?
 *
 * An operational state, not a health value: a perfectly healthy account can be
 * waiting on a login, and an account nobody is waiting on can still be at risk.
 * Health uses this as one input among several.
 */
export function isWaitingOnClient(account: JourneyAccount): boolean {
  return (
    account.waitingTaskCount > 0
    || account.criticalAccessMissing > 0
    || account.awaitingReviewCount > 0
    || (account.intakeStatus !== null && INTAKE_WITH_CLIENT.includes(account.intakeStatus))
    || account.stageKey === "waiting_for_client_information"
    || account.stageKey === "client_review"
  );
}

export function hasOverdueMilestone(account: JourneyAccount, now: Date): boolean {
  return account.milestones.some(
    (milestone) =>
      !milestone.completed
      && milestone.source !== "stage-target"
      && new Date(milestone.dueAt) < startOfDay(now),
  );
}

/**
 * Health, worst signal first.
 *
 * The order is the whole design. An account that is both waiting on the client
 * and three days past its stage target is at risk, not waiting - the wait
 * having gone on too long is the more useful thing to say. Blocked outranks
 * everything, because nothing else matters while the account cannot move.
 */
export function deriveHealth(account: JourneyAccount, now: Date): JourneyHealth {
  if (account.currentBlocker?.trim() || account.blockedTaskCount > 0) {
    return "BLOCKED";
  }

  const aging = stageAging(account, now);

  if (
    aging.isOverTarget
    || account.overdueTaskCount > 0
    || hasOverdueMilestone(account, now)
    || account.storedHealth === "RED"
    || account.status === "AT_RISK"
  ) {
    return "AT_RISK";
  }

  if (isWaitingOnClient(account)) {
    return "WAITING";
  }

  return "ON_TRACK";
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

function metFraction(requirements: JourneyRequirement[]) {
  if (requirements.length === 0) return null;

  return (
    requirements.filter((requirement) => requirement.satisfied).length / requirements.length
  );
}

/**
 * How far through the twelve-stage journey this account is.
 *
 * Whole stages passed, plus partial credit for how close it is to clearing the
 * next gate. The partial credit deliberately measures the *next* stage's
 * requirements rather than the current one's: the current stage's gates are
 * what had to hold in order to enter it, so they are already satisfied, and
 * scoring them would rate every account as ready to advance the moment it
 * arrived.
 *
 * Where a stage has no gates configured, linked task completion stands in.
 * Where there is neither, the account scores the stage boundary exactly - an
 * honest "it is here and no further" rather than an invented number.
 */
export function deriveProgress(account: JourneyAccount): number {
  if (isTerminal(account)) return 100;

  const stage = journeyStageOf(account);
  const totalTasks = account.completedTaskCount + account.openTaskCount;

  const fraction =
    metFraction(account.exitCriteria)
    ?? (totalTasks > 0 ? account.completedTaskCount / totalTasks : 0);

  const value = ((stage.position - 1 + fraction) / TOTAL_JOURNEY_STAGES) * 100;

  // Only a terminal stage reaches 100: an account still in the journey has
  // something left to do by definition.
  return Math.max(0, Math.min(99, Math.round(value)));
}

/* -------------------------------------------------------------------------- */
/* Needs Attention                                                            */
/* -------------------------------------------------------------------------- */

export type AttentionKey =
  | "blocker"
  | "missing-access"
  | "missing-assets"
  | "approval-overdue"
  | "stage-stalled"
  | "milestone-overdue"
  | "overdue-work"
  | "client-quiet"
  | "renewal-approaching"
  | "unowned";

export type AttentionAction =
  | "Follow Up"
  | "Open Review"
  | "View Blocker"
  | "Resolve"
  | "Open Client";

export interface AttentionItem {
  key: AttentionKey;
  clientId: string;
  companyName: string;
  /** The exact stored stage the account sits in. */
  stageName: string;
  /** What is wrong, in one line. */
  problem: string;
  /** How long it has been wrong. Null when the record carries no start date. */
  ageDays: number | null;
  ageLabel: string | null;
  action: AttentionAction;
  /** Higher sorts first. Blocked work outranks work that is merely late. */
  weight: number;
}

function ageLabelFor(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 0) return "Today";

  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Everything genuinely wrong with one account, worst first.
 *
 * Nothing here is a reminder or a nice-to-have: every entry is a record that
 * exists, with a date that has passed or a state that is incomplete. An
 * account with nothing wrong returns an empty list and never reaches the
 * panel, which is what keeps the panel worth reading.
 */
export function attentionItems(account: JourneyAccount, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  const aging = stageAging(account, now);
  const base = {
    clientId: account.id,
    companyName: account.companyName,
    stageName: account.stageName,
  };

  if (account.currentBlocker?.trim()) {
    items.push({
      ...base,
      key: "blocker",
      problem: account.currentBlocker.trim(),
      ageDays: aging.days,
      ageLabel: ageLabelFor(aging.days),
      action: "View Blocker",
      weight: 100,
    });
  }

  if (account.blockedTaskCount > 0) {
    items.push({
      ...base,
      key: "blocker",
      problem: `${account.blockedTaskCount} task${
        account.blockedTaskCount === 1 ? "" : "s"
      } blocked`,
      ageDays: aging.days,
      ageLabel: ageLabelFor(aging.days),
      action: "Resolve",
      weight: 95,
    });
  }

  if (!account.ownerId) {
    items.push({
      ...base,
      key: "unowned",
      problem: "Nobody owns this account",
      ageDays: null,
      ageLabel: null,
      action: "Open Client",
      weight: 92,
    });
  }

  if (account.criticalAccessMissing > 0) {
    items.push({
      ...base,
      key: "missing-access",
      problem: `Waiting on ${account.criticalAccessMissing} critical access record${
        account.criticalAccessMissing === 1 ? "" : "s"
      }`,
      ageDays: aging.days,
      ageLabel: ageLabelFor(aging.days),
      action: "Follow Up",
      weight: 90,
    });
  }

  if (account.awaitingReviewCount > 0 && aging.isOverTarget) {
    items.push({
      ...base,
      key: "approval-overdue",
      problem: `Client approval overdue by ${aging.overBy} day${
        aging.overBy === 1 ? "" : "s"
      }`,
      ageDays: aging.days,
      ageLabel: ageLabelFor(aging.days),
      action: "Open Review",
      weight: 88,
    });
  }

  if (account.intakeStatus !== null && INTAKE_WITH_CLIENT.includes(account.intakeStatus)) {
    items.push({
      ...base,
      key: "missing-assets",
      problem: "Client intake still incomplete",
      ageDays: aging.days,
      ageLabel: ageLabelFor(aging.days),
      action: "Follow Up",
      weight: 80,
    });
  }

  if (aging.isOverTarget) {
    items.push({
      ...base,
      key: "stage-stalled",
      problem: `${aging.overBy} day${aging.overBy === 1 ? "" : "s"} over the ${
        aging.targetDays
      }-day target for this stage`,
      ageDays: aging.overBy,
      ageLabel: ageLabelFor(aging.overBy),
      action: "Open Client",
      weight: 75,
    });
  }

  const overdueMilestones = account.milestones.filter(
    (milestone) =>
      !milestone.completed
      && milestone.source !== "stage-target"
      && new Date(milestone.dueAt) < startOfDay(now),
  );

  if (overdueMilestones.length > 0) {
    const worst = overdueMilestones.reduce((oldest, candidate) =>
      new Date(candidate.dueAt) < new Date(oldest.dueAt) ? candidate : oldest,
    );
    const late = Math.abs(daysBetween(new Date(worst.dueAt), now));

    items.push({
      ...base,
      key: "milestone-overdue",
      problem: `"${worst.name}" was due ${late} day${late === 1 ? "" : "s"} ago`,
      ageDays: late,
      ageLabel: ageLabelFor(late),
      action: "Open Client",
      weight: 70,
    });
  }

  if (account.overdueTaskCount > 1) {
    items.push({
      ...base,
      key: "overdue-work",
      problem: `${account.overdueTaskCount} overdue tasks`,
      ageDays: null,
      ageLabel: null,
      action: "Open Client",
      weight: 65,
    });
  }

  if (account.lastClientUpdateAt) {
    const quiet = Math.abs(daysBetween(new Date(account.lastClientUpdateAt), now));

    if (quiet >= CLIENT_QUIET_DAYS && isWaitingOnClient(account)) {
      items.push({
        ...base,
        key: "client-quiet",
        problem: `No client response for ${quiet} days`,
        ageDays: quiet,
        ageLabel: ageLabelFor(quiet),
        action: "Follow Up",
        weight: 60,
      });
    }
  }

  const renewal = account.renewalDate ?? account.contractEndDate;

  if (renewal) {
    const until = daysBetween(now, new Date(renewal));

    if (until <= RENEWAL_HORIZON_DAYS) {
      items.push({
        ...base,
        key: "renewal-approaching",
        problem:
          until < 0
            ? `Renewal date passed ${Math.abs(until)} day${
                Math.abs(until) === 1 ? "" : "s"
              } ago`
            : `Renewal due in ${until} day${until === 1 ? "" : "s"}`,
        ageDays: until < 0 ? Math.abs(until) : null,
        ageLabel: until < 0 ? ageLabelFor(Math.abs(until)) : null,
        action: "Open Client",
        weight: until < 0 ? 72 : 50,
      });
    }
  }

  return items.sort((a, b) => b.weight - a.weight);
}

export function needsAttention(account: JourneyAccount, now: Date): boolean {
  return attentionItems(account, now).length > 0;
}

/** The single worst thing about each account that has something wrong. */
export function attentionFeed(accounts: JourneyAccount[], now: Date): AttentionItem[] {
  return accounts
    .filter(isActiveAccount)
    .map((account) => attentionItems(account, now)[0])
    .filter((item): item is AttentionItem => Boolean(item))
    .sort((a, b) => b.weight - a.weight || (b.ageDays ?? 0) - (a.ageDays ?? 0));
}

/* -------------------------------------------------------------------------- */
/* Summary cards                                                              */
/* -------------------------------------------------------------------------- */

export type SummaryKey =
  | "active"
  | "on-track"
  | "waiting"
  | "at-risk"
  | "launching-soon"
  | "renewals-due";

export interface SummaryCard {
  key: SummaryKey;
  label: string;
  value: number;
  /** The second line: a share of active clients, or a horizon. */
  caption: string;
}

export function isLaunchingSoon(account: JourneyAccount, now: Date): boolean {
  if (!isActiveAccount(account)) return false;

  if (account.launchDate) {
    const until = daysBetween(now, new Date(account.launchDate));

    if (until >= 0 && until <= LAUNCH_HORIZON_DAYS) return true;
  }

  // No launch date recorded is the common case early on. An account sitting in
  // an approved-and-waiting stage is genuinely launching soon whether or not
  // somebody has typed a date, and saying so beats reporting a zero.
  return account.stageKey === "ready_for_launch" || account.stageKey === "client_approved";
}

export function isRenewalDue(account: JourneyAccount, now: Date): boolean {
  if (!isActiveAccount(account)) return false;

  const renewal = account.renewalDate ?? account.contractEndDate;

  if (!renewal) return false;

  // Already past counts too: a renewal nobody decided on is more urgent than
  // one still ahead, not less.
  return daysBetween(now, new Date(renewal)) <= RENEWAL_HORIZON_DAYS;
}

export function matchesSummary(
  account: JourneyAccount,
  key: SummaryKey,
  now: Date,
): boolean {
  if (key === "active") return isActiveAccount(account);
  if (key === "launching-soon") return isLaunchingSoon(account, now);
  if (key === "renewals-due") return isRenewalDue(account, now);

  if (!isActiveAccount(account)) return false;

  const health = deriveHealth(account, now);

  if (key === "on-track") return health === "ON_TRACK";
  if (key === "waiting") return health === "WAITING" || health === "BLOCKED";
  if (key === "at-risk") return health === "AT_RISK";

  return false;
}

export function summaryCards(accounts: JourneyAccount[], now: Date): SummaryCard[] {
  const activeCount = accounts.filter(isActiveAccount).length;
  const share = (value: number) =>
    activeCount === 0 ? "0%" : `${Math.round((value / activeCount) * 100)}%`;

  const count = (key: SummaryKey) =>
    accounts.filter((account) => matchesSummary(account, key, now)).length;

  const onTrack = count("on-track");
  const waiting = count("waiting");
  const atRisk = count("at-risk");

  return [
    { key: "active", label: "Active Clients", value: activeCount, caption: "View all" },
    { key: "on-track", label: "On Track", value: onTrack, caption: share(onTrack) },
    { key: "waiting", label: "Waiting / Blocked", value: waiting, caption: share(waiting) },
    { key: "at-risk", label: "At Risk", value: atRisk, caption: share(atRisk) },
    {
      key: "launching-soon",
      label: "Launching Soon",
      value: count("launching-soon"),
      caption: `Next ${LAUNCH_HORIZON_DAYS} days`,
    },
    {
      key: "renewals-due",
      label: "Renewals Due",
      value: count("renewals-due"),
      caption: `Next ${RENEWAL_HORIZON_DAYS} days`,
    },
  ];
}

export function healthBreakdown(accounts: JourneyAccount[], now: Date) {
  const active = accounts.filter(isActiveAccount);

  return HEALTH_ORDER.map((health) => {
    const value = active.filter((account) => deriveHealth(account, now) === health).length;

    return {
      health,
      label: HEALTH_LABELS[health],
      color: HEALTH_COLORS[health],
      value,
      share: active.length === 0 ? 0 : Math.round((value / active.length) * 100),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Milestones                                                                 */
/* -------------------------------------------------------------------------- */

/** The nearest thing due for one account, ignoring anything already done. */
export function nextMilestone(account: JourneyAccount, now: Date): JourneyMilestone | null {
  const upcoming = account.milestones
    .filter((milestone) => !milestone.completed)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  const ahead = upcoming.find((milestone) => new Date(milestone.dueAt) >= startOfDay(now));

  // An overdue milestone is still the next thing that has to happen.
  return ahead ?? upcoming[0] ?? null;
}

export function upcomingMilestones(
  accounts: JourneyAccount[],
  now: Date,
  limit = 6,
): JourneyMilestone[] {
  return accounts
    .filter(isActiveAccount)
    .flatMap((account) => account.milestones)
    .filter((milestone) => !milestone.completed)
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Exit criteria                                                              */
/* -------------------------------------------------------------------------- */

export interface ExitReadiness {
  total: number;
  met: number;
  /** Unmet gates that stop the move without a recorded override. */
  blocking: JourneyRequirement[];
  canAdvance: boolean;
  /** The sentence shown on the gate, or null when the account may advance. */
  message: string | null;
}

export function exitReadiness(account: JourneyAccount): ExitReadiness {
  const total = account.exitCriteria.length;
  const met = account.exitCriteria.filter((requirement) => requirement.satisfied).length;
  const blocking = account.exitCriteria.filter(
    (requirement) => !requirement.satisfied && requirement.isBlocking,
  );

  return {
    total,
    met,
    blocking,
    canAdvance: blocking.length === 0,
    message:
      blocking.length === 0
        ? null
        : `${blocking.length} requirement${
            blocking.length === 1 ? "" : "s"
          } must be completed before advancing.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Grouping, filtering, sorting                                               */
/* -------------------------------------------------------------------------- */

export interface PhaseColumn {
  phase: PhaseKey;
  label: string;
  blurb: string;
  headerClass: string;
  accentClass: string;
  accounts: JourneyAccount[];
}

export function groupByPhase(accounts: JourneyAccount[]): PhaseColumn[] {
  return JOURNEY_PHASES.map((phase) => ({
    phase: phase.key,
    label: phase.label,
    blurb: phase.blurb,
    headerClass: phase.headerClass,
    accentClass: phase.accentClass,
    accounts: accounts.filter((account) => phaseOf(account) === phase.key),
  }));
}

export type JourneySort =
  | "needs-attention"
  | "longest-in-stage"
  | "launch-soonest"
  | "renewal-soonest"
  | "newest";

export const JOURNEY_SORTS: { value: JourneySort; label: string }[] = [
  { value: "needs-attention", label: "Needs Attention" },
  { value: "longest-in-stage", label: "Longest in Stage" },
  { value: "launch-soonest", label: "Launch Soonest" },
  { value: "renewal-soonest", label: "Renewal Soonest" },
  { value: "newest", label: "Newest Client" },
];

export interface JourneyFilters {
  search: string;
  stageId: string;
  ownerId: string;
  health: JourneyHealth | "";
  service: string;
  launchWithinDays: number | null;
  renewalWithinDays: number | null;
}

export const EMPTY_JOURNEY_FILTERS: JourneyFilters = {
  search: "",
  stageId: "",
  ownerId: "",
  health: "",
  service: "",
  launchWithinDays: null,
  renewalWithinDays: null,
};

export function activeFilterCount(filters: JourneyFilters) {
  return [
    filters.stageId,
    filters.ownerId,
    filters.health,
    filters.service,
    filters.launchWithinDays === null ? "" : "launch",
    filters.renewalWithinDays === null ? "" : "renewal",
  ].filter(Boolean).length;
}

export function matchesSearch(account: JourneyAccount, term: string) {
  const needle = term.trim().toLowerCase();

  if (!needle) return true;

  return (
    account.companyName.toLowerCase().includes(needle)
    || account.clientName.toLowerCase().includes(needle)
    || account.stageName.toLowerCase().includes(needle)
    || (account.ownerName?.toLowerCase().includes(needle) ?? false)
  );
}

export function applyJourneyFilters(
  accounts: JourneyAccount[],
  filters: JourneyFilters,
  now: Date,
): JourneyAccount[] {
  return accounts.filter((account) => {
    if (!matchesSearch(account, filters.search)) return false;
    if (filters.stageId && account.stageId !== filters.stageId) return false;
    if (filters.ownerId && account.ownerId !== filters.ownerId) return false;
    if (filters.health && deriveHealth(account, now) !== filters.health) return false;
    if (filters.service && !account.services.includes(filters.service)) return false;

    if (filters.launchWithinDays !== null) {
      if (!account.launchDate) return false;

      const until = daysBetween(now, new Date(account.launchDate));

      if (until < 0 || until > filters.launchWithinDays) return false;
    }

    if (filters.renewalWithinDays !== null) {
      const renewal = account.renewalDate ?? account.contractEndDate;

      if (!renewal) return false;
      if (daysBetween(now, new Date(renewal)) > filters.renewalWithinDays) return false;
    }

    return true;
  });
}

/**
 * How loudly one account is asking for attention. Higher sorts first.
 *
 * The worst single problem dominates, and the number of problems only breaks
 * ties. Summing the weights instead would put an account that is mildly late
 * and up for renewal above an account nobody can move at all, and it would
 * disagree with the Needs Attention panel, which ranks by each account's worst
 * item. Two orderings of the same list on one screen is worse than either.
 */
export function urgencyScore(account: JourneyAccount, now: Date): number {
  const items = attentionItems(account, now);

  if (items.length === 0) return 0;

  const worst = items[0].weight;
  const total = items.reduce((sum, item) => sum + item.weight, 0);

  return worst * 1000 + total;
}

function timeOrInfinity(value: string | null | undefined) {
  return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
}

export function sortJourneyAccounts(
  accounts: JourneyAccount[],
  sort: JourneySort,
  now: Date,
): JourneyAccount[] {
  const sorted = [...accounts];

  switch (sort) {
    case "longest-in-stage":
      return sorted.sort((a, b) => stageAging(b, now).days - stageAging(a, now).days);
    case "launch-soonest":
      return sorted.sort(
        (a, b) => timeOrInfinity(a.launchDate) - timeOrInfinity(b.launchDate),
      );
    case "renewal-soonest":
      return sorted.sort(
        (a, b) =>
          timeOrInfinity(a.renewalDate ?? a.contractEndDate)
          - timeOrInfinity(b.renewalDate ?? b.contractEndDate),
      );
    case "newest":
      return sorted.sort(
        (a, b) => new Date(b.stageEnteredAt).getTime() - new Date(a.stageEnteredAt).getTime(),
      );
    case "needs-attention":
    default:
      return sorted.sort(
        (a, b) =>
          urgencyScore(b, now) - urgencyScore(a, now)
          || stageAging(b, now).days - stageAging(a, now).days,
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function relativeTime(value: string, now: Date): string {
  const minutes = Math.round((now.getTime() - new Date(value).getTime()) / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);

  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);

  if (days < 30) return `${days}d ago`;

  return `${Math.round(days / 30)}mo ago`;
}

export function milestoneDayLabel(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* -------------------------------------------------------------------------- */
/* Board metrics                                                              */
/* -------------------------------------------------------------------------- */

export interface BoardMetrics {
  avgDaysInStage: number;
  /** Share of active accounts still inside their stage target. */
  onTimePercent: number;
  onTimeCount: number;
  activeCount: number;
  completedMilestonesThisMonth: number;
  atRiskCount: number;
  /** Average recorded satisfaction, or null when nobody has recorded one. */
  satisfaction: number | null;
  satisfactionResponses: number;
}

/**
 * The strip along the bottom of the board.
 *
 * Every figure is counted from records that exist. Where nothing has been
 * recorded the value is null and the tile says so, rather than showing a zero
 * that reads like a measurement.
 */
export function boardMetrics(accounts: JourneyAccount[], now: Date): BoardMetrics {
  const active = accounts.filter(isActiveAccount);

  const totalDays = active.reduce(
    (total, account) => total + stageAging(account, now).days,
    0,
  );

  const onTimeCount = active.filter(
    (account) => !stageAging(account, now).isOverTarget,
  ).length;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const completedMilestonesThisMonth = accounts.reduce(
    (total, account) =>
      total
      + account.milestones.filter(
        (milestone) =>
          milestone.completed
          && milestone.source === "milestone"
          && new Date(milestone.dueAt) >= monthStart,
      ).length,
    0,
  );

  const scores = accounts
    .map((account) => account.satisfactionScore)
    .filter((score): score is number => typeof score === "number");

  return {
    avgDaysInStage:
      active.length === 0 ? 0 : Math.round((totalDays / active.length) * 10) / 10,
    onTimePercent:
      active.length === 0 ? 0 : Math.round((onTimeCount / active.length) * 100),
    onTimeCount,
    activeCount: active.length,
    completedMilestonesThisMonth,
    atRiskCount: active.filter((account) => deriveHealth(account, now) === "AT_RISK")
      .length,
    satisfaction:
      scores.length === 0
        ? null
        : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    satisfactionResponses: scores.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Health, explained                                                          */
/* -------------------------------------------------------------------------- */

export interface HealthExplanation {
  health: JourneyHealth;
  /** Why it reads that way, worst first. Empty only when on track. */
  reasons: string[];
}

/**
 * The health verdict with its reasoning.
 *
 * The verdict comes from deriveHealth rather than being recomputed here, so
 * the badge and the explanation behind it cannot disagree - which they would
 * the first time somebody edited one branch and not the other. This function
 * only says why.
 *
 * Every reason names a record with a date that has passed or a state that is
 * incomplete. "At risk" with no reasons listed would be worse than no badge.
 */
export function explainHealth(account: JourneyAccount, now: Date): HealthExplanation {
  const health = deriveHealth(account, now);
  const reasons: string[] = [];
  const aging = stageAging(account, now);

  if (account.currentBlocker?.trim()) {
    reasons.push(account.currentBlocker.trim());
  }

  if (account.blockedTaskCount > 0) {
    reasons.push(
      `${account.blockedTaskCount} task${account.blockedTaskCount === 1 ? " is" : "s are"} blocked`,
    );
  }

  if (aging.isOverTarget) {
    reasons.push(
      `Stage is ${aging.overBy} day${aging.overBy === 1 ? "" : "s"} over the ${aging.targetDays}-day target`,
    );
  }

  if (account.overdueTaskCount > 0) {
    reasons.push(
      `${account.overdueTaskCount} overdue task${account.overdueTaskCount === 1 ? "" : "s"}`,
    );
  }

  const overdueMilestones = account.milestones.filter(
    (milestone) =>
      !milestone.completed
      && milestone.source !== "stage-target"
      && new Date(milestone.dueAt) < now,
  ).length;

  if (overdueMilestones > 0) {
    reasons.push(
      `${overdueMilestones} overdue milestone${overdueMilestones === 1 ? "" : "s"}`,
    );
  }

  if (account.storedHealth === "RED" && health === "AT_RISK") {
    reasons.push("The last health assessment was red");
  }

  if (account.criticalAccessMissing > 0) {
    reasons.push(
      `Waiting on ${account.criticalAccessMissing} critical access record${
        account.criticalAccessMissing === 1 ? "" : "s"
      }`,
    );
  }

  if (account.awaitingReviewCount > 0) {
    reasons.push(
      `${account.awaitingReviewCount} review round${
        account.awaitingReviewCount === 1 ? " is" : "s are"
      } with the client`,
    );
  }

  if (
    account.intakeStatus !== null
    && INTAKE_WITH_CLIENT.includes(account.intakeStatus)
  ) {
    reasons.push("The client intake form is still outstanding");
  }

  return { health, reasons };
}

/**
 * Unmet requirements first, blocking ones before advisory.
 *
 * The list exists to answer "what is stopping this", so the things that are
 * stopping it belong at the top rather than wherever the seed happened to put
 * them.
 */
export function requirementSort(a: JourneyRequirement, b: JourneyRequirement) {
  if (a.satisfied !== b.satisfied) return Number(a.satisfied) - Number(b.satisfied);
  if (a.isBlocking !== b.isBlocking) return Number(b.isBlocking) - Number(a.isBlocking);

  return a.label.localeCompare(b.label);
}
