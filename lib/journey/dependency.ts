/**
 * Client dependencies and blockers.
 *
 * Both are raised conditions on the same record. A dependency is something the
 * client owes us; a blocker is something in the way that is ours to clear. They
 * are kept on one table because everything that reads them - the gate, the
 * health score, the secondary status, the attention list - has to consider both
 * together, and two tables would mean every reader joining twice and one of
 * them eventually forgetting.
 *
 * Status is derived rather than stored. A status column beside these timestamps
 * is a second source of truth for the same fact, and the first time somebody
 * updates one without the other the interface starts lying about a client who
 * has already answered.
 */

/** Where a raised condition has got to. */
export type DependencyStatus =
  | "REQUESTED"
  | "WAITING"
  | "OVERDUE"
  | "RECEIVED"
  | "RESOLVED"
  | "CANCELLED";

export const DEPENDENCY_STATUS_LABELS: Record<DependencyStatus, string> = {
  REQUESTED: "Requested",
  WAITING: "Waiting",
  OVERDUE: "Overdue",
  RECEIVED: "Received",
  RESOLVED: "Resolved",
  CANCELLED: "Cancelled",
};

export type FlagSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type FlagImpact = "BLOCKS_STAGE" | "DELAYS_MILESTONE" | "NO_BLOCK";

export const IMPACT_LABELS: Record<FlagImpact, string> = {
  BLOCKS_STAGE: "Blocks stage",
  DELAYS_MILESTONE: "Delays milestone",
  NO_BLOCK: "Does not block",
};

/** The shape both readers need. Dates are ISO or Date; both are accepted. */
export interface RaisedCondition {
  kind: string;
  dueAt: string | Date | null;
  raisedAt: string | Date;
  lastFollowUpAt: string | Date | null;
  followUpCount: number;
  receivedAt: string | Date | null;
  resolvedAt: string | Date | null;
  cancelledAt: string | Date | null;
  severity: FlagSeverity | null;
  impact: FlagImpact | null;
  expectedResolutionAt: string | Date | null;
}

const at = (value: string | Date | null | undefined) =>
  value === null || value === undefined ? null : new Date(value);

/**
 * Where this condition stands.
 *
 * Ordered by how settled it is. Cancelled and resolved are both closed and are
 * asked first, because a resolved item that is also past its due date is
 * resolved, not overdue - a closed thing cannot be late.
 */
export function dependencyStatus(
  condition: RaisedCondition,
  now: Date,
): DependencyStatus {
  if (at(condition.cancelledAt)) return "CANCELLED";
  if (at(condition.resolvedAt)) return "RESOLVED";

  /*
   * They answered. Still open, because somebody has to look at the answer -
   * "received" is the client's move and "resolved" is ours, and an account
   * sitting on a wrong answer should not read as finished.
   */
  if (at(condition.receivedAt)) return "RECEIVED";

  const due = at(condition.dueAt);

  if (due && due < now) return "OVERDUE";

  return condition.followUpCount > 0 ? "WAITING" : "REQUESTED";
}

export function isOpen(condition: RaisedCondition): boolean {
  return !condition.resolvedAt && !condition.cancelledAt;
}

/**
 * Whether this actually holds the stage shut.
 *
 * Impact decides, not kind. An agency can be blocked on something that does not
 * stop the stage - a slow invoice on work already delivered - and treating every
 * blocker as a stage stopper teaches people to stop raising them. A record with
 * no impact recorded falls back on its kind, which is how every flag raised
 * before this existed behaves.
 */
export function blocksStage(condition: RaisedCondition): boolean {
  if (!isOpen(condition)) return false;

  if (condition.impact) return condition.impact === "BLOCKS_STAGE";

  return condition.kind === "BLOCKED" || condition.kind === "WAITING_ON_CLIENT";
}

/** How long this has been outstanding, in whole days. */
export function ageInDays(condition: RaisedCondition, now: Date): number {
  const raised = at(condition.raisedAt);

  if (!raised) return 0;

  return Math.max(0, Math.round((now.getTime() - raised.getTime()) / 86_400_000));
}

/**
 * How long since anybody chased it.
 *
 * Null when nobody ever has, which is a different thing from "chased today" and
 * reads differently on the card: one is neglect, the other is patience.
 */
export function daysSinceFollowUp(
  condition: RaisedCondition,
  now: Date,
): number | null {
  const last = at(condition.lastFollowUpAt);

  if (!last) return null;

  return Math.max(0, Math.round((now.getTime() - last.getTime()) / 86_400_000));
}

/**
 * Whether chasing it again is reasonable yet.
 *
 * Once a day at most. The point is to stop a button being pressed four times in
 * a morning and a client being chased four times for the same thing, which is
 * how an agency teaches somebody to ignore it.
 */
export function canFollowUp(condition: RaisedCondition, now: Date): boolean {
  if (!isOpen(condition)) return false;

  const since = daysSinceFollowUp(condition, now);

  return since === null || since >= 1;
}

export interface DependencySummary {
  open: number;
  overdue: number;
  received: number;
  /** The longest anything has been outstanding. */
  oldestDays: number;
  /** Whether anything open genuinely holds the stage shut. */
  blocking: boolean;
}

export function summarise(
  conditions: RaisedCondition[],
  now: Date,
): DependencySummary {
  const open = conditions.filter(isOpen);

  return {
    open: open.length,
    overdue: open.filter((condition) => dependencyStatus(condition, now) === "OVERDUE").length,
    received: open.filter((condition) => dependencyStatus(condition, now) === "RECEIVED").length,
    oldestDays: open.reduce((worst, condition) => Math.max(worst, ageInDays(condition, now)), 0),
    blocking: open.some(blocksStage),
  };
}
