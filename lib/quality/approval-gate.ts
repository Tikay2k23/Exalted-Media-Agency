/**
 * Whether a client's work is fit to go in front of them, and then live.
 *
 * The Approvals tab has always shown four systems side by side - QA plans,
 * defects, sign-off records and launch checklists - and left the reader to
 * work out what they add up to. Each card was honest on its own and none of
 * them answered the only question being asked: can this go out.
 *
 * So this module reads all four and produces one answer, with the reasons
 * attached. Nothing here is stored. The gate is recomputed from the same rows
 * the cards render, which is what stops a page showing 65% QA beside a green
 * "ready to launch": both come from the same count or neither is drawn.
 *
 * Deliberately absent: any notion of overriding the gate. Passing a stage that
 * is not ready is the journey's business and already has an audited override;
 * duplicating it here would be a second way to skip the same checks.
 */

/* -------------------------------------------------------------------------- */
/* What it reads                                                              */
/* -------------------------------------------------------------------------- */

/** One QA test, as the plans already record them. */
export interface QaCheck {
  id: string;
  objective: string;
  status: string;
  planName: string;
  testerName: string | null;
  evidenceUrl: string | null;
  retestRequired: boolean;
}

export interface DefectRow {
  id: string;
  reference: string;
  title: string;
  severity: string;
  status: string;
  assignedToName: string | null;
  reportedAt: string;
  dueDate: string | null;
}

/** One launch checklist item. */
export interface LaunchCheck {
  id: string;
  label: string;
  category: string;
  status: string;
  isRequired: boolean;
  evidenceUrl: string | null;
}

/**
 * The client's current sign-off round.
 *
 * ReviewCycle is the request - who it went to, when, and by when they were
 * asked to answer. Approval is the record of the answer. Both are needed: a
 * status alone cannot say whether anybody has actually been asked.
 */
export interface ApprovalRound {
  id: string;
  roundNumber: number;
  status: string;
  sentAt: string | null;
  feedbackDeadline: string | null;
  approverName: string | null;
  projectName: string | null;
  /** Open revision items on this round. */
  openRevisions: number;
}

export interface ApprovalRecord {
  id: string;
  subject: string;
  approvedByName: string | null;
  approvedAt: string;
  evidenceUrl: string | null;
  /** False once withdrawn, or where the record has no evidence behind it. */
  countsForLaunch: boolean;
}

/* -------------------------------------------------------------------------- */
/* QA                                                                         */
/* -------------------------------------------------------------------------- */

/** Tests that were deliberately not run do not count either way. */
const QA_NOT_APPLICABLE = new Set(["SKIPPED"]);
/** The only status that means a check is finished and good. */
const QA_PASSED = "PASSED";

export interface QaSummary {
  total: number;
  passed: number;
  failed: number;
  awaitingRetest: number;
  notRun: number;
  percent: number;
  /** True when every applicable check has passed. */
  complete: boolean;
  ownerName: string | null;
  /** Not Started / In Progress / Complete / Failing. */
  label: string;
}

export function qaSummary(checks: QaCheck[]): QaSummary {
  const applicable = checks.filter((check) => !QA_NOT_APPLICABLE.has(check.status));
  const passed = applicable.filter((check) => check.status === QA_PASSED);
  const failed = applicable.filter((check) => check.status === "FAILED");
  const awaitingRetest = applicable.filter(
    (check) => check.status === "RETEST_REQUIRED" || check.retestRequired,
  );
  const notRun = applicable.filter((check) => check.status === "NOT_RUN");

  /*
   * The owner is whoever is actually running the tests, taken from the checks
   * rather than from a field somebody set once. Where several people have run
   * them the most recent tester would be arbitrary, so the first named one is
   * used and the checklist itself shows the rest.
   */
  const ownerName = checks.find((check) => check.testerName)?.testerName ?? null;

  const percent =
    applicable.length === 0 ? 0 : Math.round((passed.length / applicable.length) * 100);

  return {
    total: applicable.length,
    passed: passed.length,
    failed: failed.length,
    awaitingRetest: awaitingRetest.length,
    notRun: notRun.length,
    percent,
    complete: applicable.length > 0 && passed.length === applicable.length,
    ownerName,
    label:
      applicable.length === 0
        ? "Not configured"
        : failed.length > 0
          ? "Failing"
          : passed.length === applicable.length
            ? "Complete"
            : notRun.length === applicable.length
              ? "Not started"
              : "In progress",
  };
}

/* -------------------------------------------------------------------------- */
/* Defects                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Statuses that mean somebody still has work to do.
 *
 * READY_FOR_RETEST counts as open on purpose: the fix is in but nobody has
 * confirmed it, and a defect closed on the strength of an untested fix is the
 * one that reappears in front of the client.
 */
const DEFECT_OPEN = new Set([
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "READY_FOR_RETEST",
  "REOPENED",
  "BLOCKED",
]);

/** Severities that should stop a client ever seeing the work. */
const DEFECT_BLOCKING = new Set(["CRITICAL", "HIGH"]);

export interface DefectSummary {
  open: DefectRow[];
  blocking: DefectRow[];
  awaitingRetest: DefectRow[];
  total: number;
}

export function defectSummary(defects: DefectRow[]): DefectSummary {
  const open = defects.filter((defect) => DEFECT_OPEN.has(defect.status));

  return {
    open,
    blocking: open.filter((defect) => DEFECT_BLOCKING.has(defect.severity)),
    awaitingRetest: open.filter((defect) => defect.status === "READY_FOR_RETEST"),
    total: open.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Client approval                                                            */
/* -------------------------------------------------------------------------- */

export type ApprovalState =
  | "NOT_REQUESTED"
  | "WAITING_ON_CLIENT"
  | "OVERDUE"
  | "REVISIONS_REQUIRED"
  | "APPROVED";

export const APPROVAL_STATE_LABELS: Record<ApprovalState, string> = {
  NOT_REQUESTED: "Not Requested",
  WAITING_ON_CLIENT: "Waiting on Client",
  OVERDUE: "Overdue",
  REVISIONS_REQUIRED: "Revisions Required",
  APPROVED: "Approved",
};

export interface ApprovalSummary {
  state: ApprovalState;
  /** The round the buttons act on. Null before anybody has been asked. */
  round: ApprovalRound | null;
  /** The most recent sign-off that counts, if any. */
  record: ApprovalRecord | null;
  requestedAt: string | null;
  deadline: string | null;
  approverName: string | null;
  /** Days past the deadline. Null when there is no deadline or it has not passed. */
  daysOverdue: number | null;
}

function daysBetween(from: Date, to: Date) {
  const startOf = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  return Math.round((startOf(to).getTime() - startOf(from).getTime()) / 86_400_000);
}

/**
 * Where sign-off has got to.
 *
 * Read from the newest round rather than from the presence of any approval
 * record: a client who approved round one and then asked for changes in round
 * two is not approved, and a page that reads only the record would say they
 * were.
 */
export function approvalSummary(
  rounds: ApprovalRound[],
  records: ApprovalRecord[],
  now: Date,
): ApprovalSummary {
  const latest = [...rounds].sort((left, right) => right.roundNumber - left.roundNumber)[0]
    ?? null;
  const record = records.find((entry) => entry.countsForLaunch) ?? null;

  if (!latest) {
    /*
     * No round, but possibly a recorded sign-off. Approvals captured outside a
     * review cycle - a client who confirmed on a call - are real, so the state
     * follows the record rather than insisting on a process that was not used.
     */
    return {
      state: record ? "APPROVED" : "NOT_REQUESTED",
      round: null,
      record,
      requestedAt: null,
      deadline: null,
      approverName: null,
      daysOverdue: null,
    };
  }

  const deadline = latest.feedbackDeadline;
  const overdueDays =
    deadline && new Date(deadline) < now ? daysBetween(new Date(deadline), now) : null;

  const state: ApprovalState =
    latest.status === "APPROVED"
      ? "APPROVED"
      : latest.status === "REJECTED"
        || latest.status === "REVISIONS_IN_PROGRESS"
        || latest.status === "FEEDBACK_RECEIVED"
        || latest.openRevisions > 0
        ? "REVISIONS_REQUIRED"
        : latest.status === "PREPARING"
          ? "NOT_REQUESTED"
          : overdueDays !== null
            ? "OVERDUE"
            : "WAITING_ON_CLIENT";

  return {
    state,
    round: latest,
    record,
    requestedAt: latest.sentAt,
    deadline,
    approverName: latest.approverName,
    daysOverdue: overdueDays,
  };
}

/* -------------------------------------------------------------------------- */
/* Launch readiness                                                           */
/* -------------------------------------------------------------------------- */

const LAUNCH_DONE = new Set(["COMPLETE"]);
const LAUNCH_NOT_APPLICABLE = new Set(["NOT_APPLICABLE"]);

export interface LaunchSummary {
  total: number;
  complete: number;
  remaining: number;
  /** Incomplete checks that are required - what actually holds the launch. */
  blocking: LaunchCheck[];
  failed: LaunchCheck[];
  percent: number;
  ready: boolean;
}

export function launchSummary(checks: LaunchCheck[]): LaunchSummary {
  const applicable = checks.filter((check) => !LAUNCH_NOT_APPLICABLE.has(check.status));
  const complete = applicable.filter((check) => LAUNCH_DONE.has(check.status));
  const blocking = applicable.filter(
    (check) => check.isRequired && !LAUNCH_DONE.has(check.status),
  );

  return {
    total: applicable.length,
    complete: complete.length,
    remaining: applicable.length - complete.length,
    blocking,
    failed: applicable.filter((check) => check.status === "FAILED"),
    percent:
      applicable.length === 0
        ? 0
        : Math.round((complete.length / applicable.length) * 100),
    // No checks configured is not readiness. It is an unconfigured launch.
    ready: applicable.length > 0 && blocking.length === 0,
  };
}

/* -------------------------------------------------------------------------- */
/* The gate                                                                   */
/* -------------------------------------------------------------------------- */

export type GateState =
  | "QA_IN_PROGRESS"
  | "QA_FAILING"
  | "QA_READY"
  | "WAITING_ON_CLIENT"
  | "REVISIONS_REQUIRED"
  | "LAUNCH_BLOCKED"
  | "READY_FOR_LAUNCH_REVIEW";

export const GATE_LABELS: Record<GateState, string> = {
  QA_IN_PROGRESS: "Internal QA",
  QA_FAILING: "QA Failing",
  QA_READY: "QA Ready",
  WAITING_ON_CLIENT: "Waiting on Client",
  REVISIONS_REQUIRED: "Revisions Required",
  LAUNCH_BLOCKED: "Launch Blocked",
  READY_FOR_LAUNCH_REVIEW: "Ready for Launch Review",
};

export type HealthState = "GOOD" | "NEEDS_ATTENTION" | "AT_RISK" | "BLOCKED";

export const HEALTH_LABELS: Record<HealthState, string> = {
  GOOD: "Good",
  NEEDS_ATTENTION: "Needs Attention",
  AT_RISK: "At Risk",
  BLOCKED: "Blocked",
};

/** One line of the health breakdown, so a score can be argued with. */
export interface HealthFactor {
  label: string;
  score: number;
  detail: string;
}

export interface ApprovalGate {
  state: GateState;
  /** What is stopping the next step, in the order somebody would clear it. */
  blockers: string[];
  qa: QaSummary;
  defects: DefectSummary;
  approval: ApprovalSummary;
  launch: LaunchSummary;
  health: HealthState;
  /** 0-100, the weighted mean of the factors below. */
  healthScore: number;
  factors: HealthFactor[];
  /** The two or three things actually driving the state. */
  risks: string[];
  /** Whether Start Launch Review may run at all. */
  canStartLaunchReview: boolean;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The whole picture, decided once.
 *
 * The order of the arms is the order the work actually happens in, so the
 * state can never skip ahead of itself: a launch cannot be blocked before QA
 * has passed, because nothing has been shown to the client yet.
 */
export function approvalGate(input: {
  qa: QaCheck[];
  defects: DefectRow[];
  rounds: ApprovalRound[];
  records: ApprovalRecord[];
  launch: LaunchCheck[];
  now: Date;
}): ApprovalGate {
  const qa = qaSummary(input.qa);
  const defects = defectSummary(input.defects);
  const approval = approvalSummary(input.rounds, input.records, input.now);
  const launch = launchSummary(input.launch);

  const blockers: string[] = [];

  if (defects.blocking.length > 0) {
    blockers.push(
      `${plural(defects.blocking.length, "critical or high defect", "critical or high defects")} still open`,
    );
  }

  if (qa.failed > 0) blockers.push(`${plural(qa.failed, "QA check has", "QA checks have")} failed`);
  if (qa.awaitingRetest > 0) {
    blockers.push(`${plural(qa.awaitingRetest, "QA check needs", "QA checks need")} a retest`);
  }
  if (!qa.complete && qa.total > 0) {
    blockers.push(`${plural(qa.total - qa.passed, "QA check", "QA checks")} not yet passed`);
  }
  if (qa.total === 0) blockers.push("No QA checks configured");

  if (approval.state !== "APPROVED") {
    blockers.push(
      approval.state === "NOT_REQUESTED"
        ? "Client approval has not been requested"
        : approval.state === "REVISIONS_REQUIRED"
          ? "The client asked for revisions"
          : "Client approval is still outstanding",
    );
  }

  if (launch.blocking.length > 0) {
    blockers.push(
      `${plural(launch.blocking.length, "launch check blocks", "launch checks block")} go-live`,
    );
  }

  /* The state, in the order the work happens. */
  const state: GateState =
    qa.failed > 0 || defects.blocking.length > 0
      ? "QA_FAILING"
      : !qa.complete
        ? "QA_IN_PROGRESS"
        : approval.state === "REVISIONS_REQUIRED"
          ? "REVISIONS_REQUIRED"
          : approval.state === "NOT_REQUESTED"
            ? "QA_READY"
            : approval.state !== "APPROVED"
              ? "WAITING_ON_CLIENT"
              : launch.blocking.length > 0 || launch.total === 0
                ? "LAUNCH_BLOCKED"
                : "READY_FOR_LAUNCH_REVIEW";

  const factors = healthFactors({ qa, defects, approval, launch });
  const healthScore = Math.round(
    factors.reduce((total, factor) => total + factor.score, 0) / factors.length,
  );

  /*
   * Blocked is not a low score - it is a fact. An account with one critical
   * defect and everything else perfect scores well and cannot ship, so the
   * state is decided before the number rather than from it.
   */
  const health: HealthState =
    defects.blocking.length > 0 || qa.failed > 0
      ? "BLOCKED"
      : healthScore >= 80
        ? "GOOD"
        : healthScore >= 60
          ? "NEEDS_ATTENTION"
          : "AT_RISK";

  return {
    state,
    blockers,
    qa,
    defects,
    approval,
    launch,
    health,
    healthScore,
    factors,
    risks: blockers.slice(0, 3),
    /*
     * The review is a validation, so it may run whenever there is something to
     * validate. Refusing to open it until everything already passes would make
     * it useless - the whole point is being told what is missing.
     */
    canStartLaunchReview: launch.total > 0,
  };
}

/**
 * The five numbers behind the score.
 *
 * Each is a percentage of its own subject, so the mean is not weighted by
 * accident of scale, and each carries the sentence that explains it - a score
 * somebody cannot take apart is a score they learn to ignore.
 */
function healthFactors(input: {
  qa: QaSummary;
  defects: DefectSummary;
  approval: ApprovalSummary;
  launch: LaunchSummary;
}): HealthFactor[] {
  const { qa, defects, approval, launch } = input;

  const defectScore =
    defects.total === 0
      ? 100
      : Math.max(0, 100 - defects.blocking.length * 30 - (defects.total - defects.blocking.length) * 10);

  const approvalScore =
    approval.state === "APPROVED"
      ? 100
      : approval.state === "WAITING_ON_CLIENT"
        ? 60
        : approval.state === "REVISIONS_REQUIRED"
          ? 40
          : approval.state === "OVERDUE"
            ? 25
            : 50;

  const scheduleScore =
    approval.daysOverdue === null ? 100 : Math.max(0, 100 - approval.daysOverdue * 10);

  return [
    {
      label: "QA completion",
      score: qa.total === 0 ? 0 : qa.percent,
      detail:
        qa.total === 0
          ? "No QA checks configured."
          : `${qa.passed} of ${qa.total} checks passed.`,
    },
    {
      label: "Defects",
      score: defectScore,
      detail:
        defects.total === 0
          ? "No open defects."
          : `${plural(defects.total, "open defect", "open defects")}, ${defects.blocking.length} critical or high.`,
    },
    {
      label: "Client approval",
      score: approvalScore,
      detail: `${APPROVAL_STATE_LABELS[approval.state]}${
        approval.approverName ? ` - ${approval.approverName}` : ""
      }.`,
    },
    {
      label: "Launch readiness",
      score: launch.total === 0 ? 0 : launch.percent,
      detail:
        launch.total === 0
          ? "No launch checks configured."
          : `${launch.complete} of ${launch.total} complete, ${launch.blocking.length} blocking.`,
    },
    {
      label: "Schedule",
      score: scheduleScore,
      detail:
        approval.daysOverdue === null
          ? "Nothing is past its date."
          : `Client response is ${plural(approval.daysOverdue, "day", "days")} overdue.`,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Start Launch Review                                                        */
/* -------------------------------------------------------------------------- */

export interface LaunchReviewResult {
  passed: boolean;
  /** Exactly what is missing, named, in the order to clear it. */
  failures: string[];
}

/**
 * The final validation, run rather than asserted.
 *
 * Returns what is wrong instead of a yes or no, because the useful answer to
 * "can we launch" is almost always the list.
 */
export function runLaunchReview(gate: ApprovalGate): LaunchReviewResult {
  const failures: string[] = [];

  if (!gate.qa.complete) {
    failures.push(
      gate.qa.total === 0
        ? "Internal QA: no checks configured"
        : `Internal QA: ${gate.qa.total - gate.qa.passed} of ${gate.qa.total} checks not passed`,
    );
  }

  for (const defect of gate.defects.blocking) {
    failures.push(`Blocking defect: ${defect.title}`);
  }

  if (gate.approval.state !== "APPROVED") {
    failures.push(`Client approval: ${APPROVAL_STATE_LABELS[gate.approval.state]}`);
  }

  for (const check of gate.launch.blocking) {
    failures.push(`Launch check: ${check.label}`);
  }

  if (gate.launch.total === 0) {
    failures.push("Launch checklist: no checks configured");
  }

  return { passed: failures.length === 0, failures };
}
