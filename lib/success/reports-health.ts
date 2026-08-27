/**
 * What the Reports & Health tab knows, and what it does not.
 *
 * The page aggregates five systems that already exist - client reports,
 * optimizations, health assessments, strategy goals and the renewal record -
 * and adds nothing of its own. Strategy defines the goals; this measures
 * against them. Work owns the tasks; this counts them. Journey owns stage
 * health; this consumes it.
 *
 * Two things it deliberately cannot tell you, and says so rather than
 * inventing:
 *
 *   - campaign performance. There is no metrics store in this application:
 *     nothing records a client's traffic, conversion rate, form submissions or
 *     response time over time. A sparkline here would be a drawing.
 *
 *   - numeric goal progress. StrategyGoal.target and baseline are free text
 *     ("150 qualified leads per month"), so "128 of 150, 85%" cannot be
 *     computed from them. Parsing a number out of a sentence and charting it
 *     would be a guess wearing a progress bar.
 *
 * Both are reported as absent. A card that admits it has no data is worth more
 * than one that fills the space.
 */

/* -------------------------------------------------------------------------- */
/* Reports                                                                    */
/* -------------------------------------------------------------------------- */

export interface ReportRow {
  id: string;
  type: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  dueAt: string | null;
  sentAt: string | null;
  preparedByName: string | null;
  documentUrl: string | null;
}

/** Statuses that mean the client has actually received it. */
const REPORT_DELIVERED = new Set(["SENT", "ACKNOWLEDGED"]);
/** Statuses that mean somebody still has to do something. */
const REPORT_OPEN = new Set(["DRAFT", "IN_REVIEW", "APPROVED", "LATE"]);

export type DueState = "NONE" | "COMFORTABLE" | "SOON" | "OVERDUE";

export interface NextReport {
  report: ReportRow | null;
  /** Negative once the date has passed. Null when nothing is scheduled. */
  daysRemaining: number | null;
  state: DueState;
  label: string;
}

export interface ReportSummary {
  /** Delivered inside the current calendar year. */
  sentThisYear: number;
  sentLastYear: number;
  /** Whole percent against last year. Null when last year had none. */
  changePercent: number | null;
  open: ReportRow[];
  delivered: ReportRow[];
  next: NextReport;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetween(from: Date, to: Date) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Where reporting has got to.
 *
 * The count is of reports actually delivered, not of reports written: a draft
 * nobody sent has told the client nothing, and counting it would make the
 * headline figure flatter than the service.
 */
export function reportSummary(reports: ReportRow[], now: Date): ReportSummary {
  const year = now.getFullYear();
  const delivered = reports.filter((report) => REPORT_DELIVERED.has(report.status));

  const inYear = (offset: number) =>
    delivered.filter(
      (report) => report.sentAt && new Date(report.sentAt).getFullYear() === year - offset,
    ).length;

  const sentThisYear = inYear(0);
  const sentLastYear = inYear(1);

  /*
   * Against nothing is not an increase. A first year of reporting shows the
   * count and no comparison rather than a triumphant infinity.
   */
  const changePercent =
    sentLastYear === 0
      ? null
      : Math.round(((sentThisYear - sentLastYear) / sentLastYear) * 100);

  const open = reports.filter((report) => REPORT_OPEN.has(report.status));

  /* The soonest thing still owed. */
  const scheduled = open
    .filter((report) => report.dueAt)
    .sort((left, right) => Date.parse(left.dueAt as string) - Date.parse(right.dueAt as string));

  const next = scheduled[0] ?? null;
  const daysRemaining = next?.dueAt ? daysBetween(now, new Date(next.dueAt)) : null;

  const state: DueState =
    daysRemaining === null
      ? "NONE"
      : daysRemaining < 0
        ? "OVERDUE"
        : daysRemaining <= 7
          ? "SOON"
          : "COMFORTABLE";

  return {
    sentThisYear,
    sentLastYear,
    changePercent,
    open,
    delivered,
    next: {
      report: next,
      daysRemaining,
      state,
      label:
        daysRemaining === null
          ? "Nothing scheduled"
          : daysRemaining < 0
            ? `Overdue by ${plural(Math.abs(daysRemaining), "day", "days")}`
            : daysRemaining === 0
              ? "Due today"
              : plural(daysRemaining, "day", "days"),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Optimizations                                                              */
/* -------------------------------------------------------------------------- */

export interface OptimizationRow {
  id: string;
  platform: string;
  observedProblem: string;
  proposedChange: string;
  expectedMetric: string | null;
  result: string | null;
  decision: string;
  ownerName: string | null;
  startDate: string | null;
  endDate: string | null;
}

/**
 * Whether an optimization is still running.
 *
 * The stored field is a decision rather than a status - what the agency
 * concluded, not where the work is - so "open" is read from the decision being
 * unmade and from there being no end date. An optimization concluded KEEP with
 * no end date is still being watched.
 */
export function isOptimizationOpen(row: OptimizationRow): boolean {
  if (row.endDate) return false;

  return row.decision === "PENDING" || row.decision === "CONTINUE_TESTING";
}

export interface OptimizationSummary {
  open: OptimizationRow[];
  concluded: OptimizationRow[];
  /** Concluded with a decision that says it worked. */
  kept: number;
  /** Concluded with a decision that says it did not. */
  reversed: number;
  inconclusive: number;
}

export function optimizationSummary(rows: OptimizationRow[]): OptimizationSummary {
  const open = rows.filter(isOptimizationOpen);
  const concluded = rows.filter((row) => !isOptimizationOpen(row));

  return {
    open,
    concluded,
    kept: concluded.filter((row) => row.decision === "KEEP").length,
    reversed: concluded.filter((row) => row.decision === "REVERSE").length,
    inconclusive: concluded.filter((row) => row.decision === "INCONCLUSIVE").length,
  };
}

/* -------------------------------------------------------------------------- */
/* Health                                                                     */
/* -------------------------------------------------------------------------- */

export interface HealthAssessment {
  status: string;
  healthScore: number | null;
  satisfactionScore: number | null;
  openComplaints: number;
  renewalProbability: number | null;
  assessedAt: string;
}

export interface HealthSummary {
  /** Null when nobody has assessed this account. */
  score: number | null;
  status: string | null;
  assessedAt: string | null;
  daysSinceAssessment: number | null;
  /** True once the assessment is old enough to be worth redoing. */
  stale: boolean;
  strengths: string[];
  risks: string[];
}

/** An assessment older than this has stopped describing the account. */
const ASSESSMENT_FRESH_DAYS = 45;

/**
 * The recorded health, with the reasons around it.
 *
 * The score is whatever the last assessment recorded - this does not compute a
 * second one, because the health engine already owns that and two numbers for
 * one account is the failure mode. What is added is the surrounding evidence:
 * things drawn from live records that a reader can check.
 */
export function healthSummary(input: {
  assessment: HealthAssessment | null;
  reports: ReportSummary;
  optimizations: OptimizationSummary;
  openComplaints: number;
  overdueTasks: number;
  now: Date;
}): HealthSummary {
  const { assessment, reports, optimizations, now } = input;

  const strengths: string[] = [];
  const risks: string[] = [];

  if (reports.sentThisYear > 0) {
    strengths.push(`${plural(reports.sentThisYear, "report", "reports")} delivered this year`);
  }

  if (optimizations.kept > 0) {
    strengths.push(`${plural(optimizations.kept, "optimization", "optimizations")} kept after testing`);
  }

  if (input.openComplaints === 0 && assessment) {
    strengths.push("No open complaints");
  }

  if (assessment?.satisfactionScore !== null && assessment?.satisfactionScore !== undefined) {
    if (assessment.satisfactionScore >= 8) {
      strengths.push(`Satisfaction recorded at ${assessment.satisfactionScore} of 10`);
    } else if (assessment.satisfactionScore <= 5) {
      risks.push(`Satisfaction recorded at ${assessment.satisfactionScore} of 10`);
    }
  }

  if (reports.next.state === "OVERDUE") {
    risks.push(`Client report ${reports.next.label.toLowerCase()}`);
  }

  if (input.openComplaints > 0) {
    risks.push(`${plural(input.openComplaints, "complaint", "complaints")} open`);
  }

  if (input.overdueTasks > 0) {
    risks.push(`${plural(input.overdueTasks, "task", "tasks")} overdue`);
  }

  if (optimizations.reversed > 0) {
    risks.push(`${plural(optimizations.reversed, "optimization was", "optimizations were")} reversed`);
  }

  const daysSince = assessment ? daysBetween(new Date(assessment.assessedAt), now) : null;
  const stale = daysSince !== null && daysSince > ASSESSMENT_FRESH_DAYS;

  if (stale) {
    risks.push(`Health last assessed ${plural(daysSince as number, "day", "days")} ago`);
  }

  return {
    score: assessment?.healthScore ?? null,
    status: assessment?.status ?? null,
    assessedAt: assessment?.assessedAt ?? null,
    daysSinceAssessment: daysSince,
    stale,
    strengths,
    risks,
  };
}

/* -------------------------------------------------------------------------- */
/* Goals                                                                      */
/* -------------------------------------------------------------------------- */

export interface GoalRow {
  id: string;
  title: string;
  metric: string | null;
  baseline: string | null;
  target: string | null;
  targetDate: string | null;
  status: string;
  ownerName: string | null;
  priority: string;
}

export type GoalState = "ACHIEVED" | "ON_TRACK" | "AT_RISK" | "BEHIND" | "NOT_STARTED" | "DROPPED";

export const GOAL_STATE_LABELS: Record<GoalState, string> = {
  ACHIEVED: "Achieved",
  ON_TRACK: "On Track",
  AT_RISK: "At Risk",
  BEHIND: "Behind",
  NOT_STARTED: "Not Started",
  DROPPED: "Dropped",
};

export interface GoalProgress {
  goal: GoalRow;
  state: GoalState;
  /** Days to the target date. Negative once passed. Null when undated. */
  daysRemaining: number | null;
  /**
   * Why the state is what it is.
   *
   * Always from the status and the date, never from a measured value: goals
   * carry their target as free text, so there is no number to compare.
   */
  reason: string;
}

/**
 * Where each strategy goal stands.
 *
 * Deliberately not a percentage. The goal's target is a sentence, so the only
 * honest inputs are the status somebody set and whether the date has passed -
 * and a progress bar drawn from those would imply a measurement nobody took.
 */
export function goalProgress(goals: GoalRow[], now: Date): GoalProgress[] {
  return goals.map((goal) => {
    const daysRemaining = goal.targetDate
      ? daysBetween(now, new Date(goal.targetDate))
      : null;

    if (goal.status === "ACHIEVED") {
      return { goal, state: "ACHIEVED", daysRemaining, reason: "Marked achieved." };
    }

    if (goal.status === "DROPPED") {
      return { goal, state: "DROPPED", daysRemaining, reason: "No longer being pursued." };
    }

    if (goal.status === "PROPOSED") {
      return {
        goal,
        state: "NOT_STARTED",
        daysRemaining,
        reason: "Proposed but not yet agreed.",
      };
    }

    if (daysRemaining === null) {
      return { goal, state: "ON_TRACK", daysRemaining, reason: "In progress, no target date set." };
    }

    if (daysRemaining < 0) {
      return {
        goal,
        state: "BEHIND",
        daysRemaining,
        reason: `Target date passed ${plural(Math.abs(daysRemaining), "day", "days")} ago.`,
      };
    }

    if (daysRemaining <= 14) {
      return {
        goal,
        state: "AT_RISK",
        daysRemaining,
        reason: `${plural(daysRemaining, "day", "days")} to the target date.`,
      };
    }

    return {
      goal,
      state: "ON_TRACK",
      daysRemaining,
      reason: `${plural(daysRemaining, "day", "days")} to the target date.`,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Renewal                                                                    */
/* -------------------------------------------------------------------------- */

export interface RenewalSummary {
  renewalDate: string | null;
  daysRemaining: number | null;
  monthlyValue: number | null;
  contractMonths: number | null;
  stage: string | null;
  /** True once the renewal is close enough to need a conversation. */
  approaching: boolean;
}

/** Inside this window a renewal wants a conversation rather than a diary note. */
const RENEWAL_WINDOW_DAYS = 90;

export function renewalSummary(input: {
  renewalDate: string | null;
  monthlyValue: number | null;
  contractStart: string | null;
  contractEnd: string | null;
  stage: string | null;
  now: Date;
}): RenewalSummary {
  const date = input.renewalDate ?? input.contractEnd;
  const daysRemaining = date ? daysBetween(input.now, new Date(date)) : null;

  const contractMonths =
    input.contractStart && input.contractEnd
      ? Math.max(
          1,
          Math.round(
            daysBetween(new Date(input.contractStart), new Date(input.contractEnd)) / 30.44,
          ),
        )
      : null;

  return {
    renewalDate: date,
    daysRemaining,
    monthlyValue: input.monthlyValue,
    contractMonths,
    stage: input.stage,
    approaching: daysRemaining !== null && daysRemaining <= RENEWAL_WINDOW_DAYS,
  };
}

/* -------------------------------------------------------------------------- */
/* What to do next                                                            */
/* -------------------------------------------------------------------------- */

export type ReportingActionKey =
  | "report-overdue"
  | "report-due"
  | "health-stale"
  | "health-poor"
  | "optimizations-open"
  | "goal-behind"
  | "renewal-approaching"
  | "nothing";

export interface ReportingAction {
  key: ReportingActionKey;
  title: string;
  detail: string;
  /** The button, or null where the state needs no action. */
  action: { label: string; target: "report" | "health" | "optimizations" | "goals" | "renewal" } | null;
}

/**
 * The single next thing, decided rather than suggested.
 *
 * Ordered by what costs the agency most: a report the client was promised and
 * did not get, then an account whose health nobody has checked, then work in
 * flight. Deterministic - the same account produces the same answer twice.
 */
export function nextReportingAction(input: {
  reports: ReportSummary;
  health: HealthSummary;
  optimizations: OptimizationSummary;
  goals: GoalProgress[];
  renewal: RenewalSummary;
}): ReportingAction {
  const { reports, health, optimizations, goals, renewal } = input;

  if (reports.next.state === "OVERDUE") {
    return {
      key: "report-overdue",
      title: "A client report is overdue",
      detail: reports.next.label,
      action: { label: "Prepare report", target: "report" },
    };
  }

  if (health.status === "AT_RISK" || health.status === "CRITICAL") {
    return {
      key: "health-poor",
      title: `Account health is ${health.status === "CRITICAL" ? "critical" : "at risk"}`,
      detail: health.risks[0] ?? "Review the assessment and agree a recovery plan.",
      action: { label: "Review health", target: "health" },
    };
  }

  if (reports.next.state === "SOON") {
    return {
      key: "report-due",
      title: "The next client report is due",
      detail: reports.next.label,
      action: { label: "Prepare report", target: "report" },
    };
  }

  if (health.score === null || health.stale) {
    return {
      key: "health-stale",
      title: health.score === null ? "Health has never been assessed" : "Health assessment is out of date",
      detail:
        health.daysSinceAssessment === null
          ? "Record a first assessment so the score means something."
          : `Last assessed ${plural(health.daysSinceAssessment, "day", "days")} ago.`,
      action: { label: "Assess health", target: "health" },
    };
  }

  const behind = goals.filter((goal) => goal.state === "BEHIND");

  if (behind.length > 0) {
    return {
      key: "goal-behind",
      title: `${plural(behind.length, "goal is", "goals are")} past target`,
      detail: behind[0].goal.title,
      action: { label: "Review goals", target: "goals" },
    };
  }

  if (renewal.approaching) {
    return {
      key: "renewal-approaching",
      title: "Renewal is approaching",
      detail:
        renewal.daysRemaining === null
          ? "No renewal date set."
          : `${plural(renewal.daysRemaining, "day", "days")} to the renewal date.`,
      action: { label: "Open renewal", target: "renewal" },
    };
  }

  if (optimizations.open.length > 0) {
    return {
      key: "optimizations-open",
      title: `${plural(optimizations.open.length, "optimization is", "optimizations are")} still running`,
      detail: "Record the result once each has been measured.",
      action: { label: "View optimizations", target: "optimizations" },
    };
  }

  return {
    key: "nothing",
    title: "Nothing needs attention",
    detail: "Reporting is up to date and the account is healthy.",
    action: null,
  };
}
