/**
 * Where an optimization is, worked out from what is recorded about it.
 *
 * The table stores a decision - what the agency concluded - plus the dates the
 * test ran and, now, the moment somebody called it off. It does not store a
 * status, and deliberately still does not: a status column beside these fields
 * is a second answer to the same question, and the two drift the first time a
 * date is edited and the label is not.
 *
 * So the five states the workspace filters on are read back out of the facts:
 *
 *   Cancelled    somebody stopped it, and said when
 *   Completed    a decision was recorded - keep, adjust, reverse, inconclusive
 *   Monitoring   the change is live and being watched (CONTINUE_TESTING)
 *   In progress  it has started and nobody has concluded anything
 *   Planned      it has not started
 *
 * "Monitoring" maps onto CONTINUE_TESTING rather than a new enum value because
 * that is already what CONTINUE_TESTING means.
 */

export type OptimizationState =
  | "PLANNED"
  | "IN_PROGRESS"
  | "MONITORING"
  | "COMPLETED"
  | "CANCELLED";

export const OPTIMIZATION_STATE_LABELS: Record<OptimizationState, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  MONITORING: "Monitoring",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** The states the workspace opens on. Everything else is history. */
export const OPEN_OPTIMIZATION_STATES: OptimizationState[] = [
  "PLANNED",
  "IN_PROGRESS",
  "MONITORING",
];

/** Decisions that mean somebody has concluded the test. */
const CONCLUDED = ["KEEP", "ADJUST", "REVERSE", "INCONCLUSIVE"];

export interface OptimizationStateInput {
  decision: string;
  startDate: string | null;
  cancelledAt: string | null;
}

export function optimizationState(
  row: OptimizationStateInput,
  now: Date,
): OptimizationState {
  if (row.cancelledAt) return "CANCELLED";

  if (CONCLUDED.includes(row.decision)) return "COMPLETED";

  if (row.decision === "CONTINUE_TESTING") return "MONITORING";

  /*
   * A start date in the future is a plan, not work in progress. Somebody
   * scheduling next month's test should not see it counted as running today.
   */
  if (row.startDate && Date.parse(row.startDate) <= now.getTime()) {
    return "IN_PROGRESS";
  }

  return "PLANNED";
}

export function isOpenState(state: OptimizationState): boolean {
  return OPEN_OPTIMIZATION_STATES.includes(state);
}

/**
 * What can be done to an optimization in this state.
 *
 * The workspace shows exactly these and nothing else, so a button that would
 * be refused by the server never appears. Editing is allowed while the record
 * is still live; a cancelled or completed one is history and is left alone.
 */
export function optimizationActions(state: OptimizationState): {
  start: boolean;
  monitor: boolean;
  complete: boolean;
  cancel: boolean;
  edit: boolean;
  note: boolean;
} {
  const live = isOpenState(state);

  return {
    start: state === "PLANNED",
    monitor: state === "IN_PROGRESS",
    complete: state === "IN_PROGRESS" || state === "MONITORING",
    cancel: live,
    edit: live,
    note: live,
  };
}

export const OPTIMIZATION_PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
] as const;

/**
 * The outcome recorded when a test is concluded.
 *
 * These are the existing decision values under the words the spec asks for.
 * "Exceeded" and "met" are both KEEP because the table records what the agency
 * did about the change, and in both cases it kept it; the distinction lives in
 * the outcome label stored with the result.
 */
export const OPTIMIZATION_OUTCOMES = [
  { value: "EXCEEDED", label: "Exceeded expectation", decision: "KEEP" },
  { value: "MET", label: "Met expectation", decision: "KEEP" },
  { value: "PARTIAL", label: "Partial improvement", decision: "ADJUST" },
  { value: "NONE", label: "No improvement", decision: "INCONCLUSIVE" },
  { value: "NEGATIVE", label: "Negative impact", decision: "REVERSE" },
] as const;

export type OptimizationOutcome = (typeof OPTIMIZATION_OUTCOMES)[number]["value"];

export function decisionForOutcome(outcome: string): string | null {
  return OPTIMIZATION_OUTCOMES.find((row) => row.value === outcome)?.decision ?? null;
}

/* -------------------------------------------------------------------------- */
/* The row the workspace reads                                                */
/* -------------------------------------------------------------------------- */

/**
 * One optimization, as the workspace needs it.
 *
 * Wider than the summary row on the card: that one answers "how many are
 * running", this one has to show the record itself.
 */
export interface OptimizationDetail {
  id: string;
  title: string | null;
  platform: string;
  observedProblem: string;
  proposedChange: string;
  hypothesis: string | null;
  evidence: string | null;
  expectedMetric: string | null;
  previousSetting: string | null;
  newSetting: string | null;
  metricBefore: string | null;
  metricAfter: string | null;
  notes: string | null;
  priority: string;
  serviceType: string | null;
  decision: string;
  result: string | null;
  startDate: string | null;
  endDate: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  completedAt: string | null;
  ownerId: string | null;
  ownerName: string | null;
  createdByName: string | null;
  completedByName: string | null;
  cancelledByName: string | null;
  createdAt: string;
  updatedAt: string;
  task: { id: string; title: string; status: string; dueDate: string } | null;
}

/** Highest first, so what matters is read first. */
const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Sorts the way somebody working the list would want it.
 *
 * Live work first and by priority, because that is the question the list
 * answers - what should I be looking at. History follows, newest first.
 */
export function sortOptimizations(
  rows: OptimizationDetail[],
  now: Date,
): OptimizationDetail[] {
  return [...rows].sort((a, b) => {
    const aOpen = isOpenState(optimizationState(a, now));
    const bOpen = isOpenState(optimizationState(b, now));

    if (aOpen !== bOpen) return aOpen ? -1 : 1;

    if (aOpen) {
      const byPriority =
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);

      if (byPriority !== 0) return byPriority;
    }

    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

/** What to call it. Rows written before titles existed have none. */
export function optimizationName(row: OptimizationDetail): string {
  return row.title?.trim() || `${row.platform}: ${row.observedProblem.slice(0, 60)}`;
}

/**
 * An open optimization whose review date has passed.
 *
 * A test nobody concluded is the failure mode the log exists to catch, so it
 * is worth naming rather than leaving somebody to compare dates by eye.
 */
export function isOverdueForReview(row: OptimizationDetail, now: Date): boolean {
  if (!isOpenState(optimizationState(row, now))) return false;
  if (!row.endDate) return false;

  return Date.parse(row.endDate) < now.getTime();
}
