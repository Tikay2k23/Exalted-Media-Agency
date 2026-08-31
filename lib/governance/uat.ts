/**
 * Internal UAT: what has been tested, what failed, and whether that adds up to
 * a release.
 *
 * Two rules run through all of it.
 *
 * A test case has no status of its own. Its status is its latest run's, so a
 * case cannot read Passed while its last execution says otherwise - the same
 * reason nothing else in this application stores a status beside the facts
 * that decide it.
 *
 * Readiness is calculated, never set. Nobody can mark the system ready while a
 * P0 or P1 is open, because "ready" is not a field.
 */

export type UatStatus =
  | "NOT_TESTED"
  | "TESTING"
  | "PASSED"
  | "FAILED"
  | "BLOCKED"
  | "RETEST_REQUIRED";

export type UatSeverity = "P0" | "P1" | "P2" | "P3";

export const UAT_STATUS_LABELS: Record<UatStatus, string> = {
  NOT_TESTED: "Not tested",
  TESTING: "Testing",
  PASSED: "Passed",
  FAILED: "Failed",
  BLOCKED: "Blocked",
  RETEST_REQUIRED: "Retest required",
};

export const UAT_SEVERITY_LABELS: Record<UatSeverity, string> = {
  P0: "P0 - Critical",
  P1: "P1 - High",
  P2: "P2 - Medium",
  P3: "P3 - Low",
};

/** P0 and P1 block a release. P2 may be accepted; P3 is backlog. */
export const RELEASE_BLOCKING: UatSeverity[] = ["P0", "P1"];

/**
 * The areas under test.
 *
 * A list rather than an enum: operations will want to add an area without a
 * migration, and nothing keys off these except grouping.
 */
export const UAT_MODULES = [
  "Dashboard",
  "My Work",
  "Weekly Work",
  "Sales",
  "Won Conversion",
  "Client Overview",
  "Account",
  "Strategy",
  "Intake",
  "A2P",
  "Work",
  "Projects",
  "EOD",
  "Journey",
  "Approvals",
  "Reports & Health",
  "Files & Access",
  "Activity & Notes",
  "Integrations",
  "Billing & Payments",
  "Renewal & Growth",
  "Offboarding",
  "Notifications",
  "Permissions",
  "Performance",
  "Responsive",
  "Accessibility",
  "Error Handling",
  "Data Consistency",
  "End-to-End Lifecycle",
] as const;

/** The ones a release cannot ship without having exercised. */
export const CRITICAL_MODULES: string[] = [
  "Permissions",
  "Data Consistency",
  "End-to-End Lifecycle",
  "Journey",
  "Approvals",
  "Work",
];

export interface UatRun {
  id: string;
  runNumber: number;
  status: UatStatus;
  severity: UatSeverity | null;
  actualResult: string | null;
  blockedReason: string | null;
  testerName: string | null;
  testedAt: string;
  taskId: string | null;
  taskTitle?: string | null;
  taskStatus?: string | null;
}

export interface UatCase {
  id: string;
  reference: string;
  module: string;
  name: string;
  severity: UatSeverity;
  /** Newest first. */
  runs: UatRun[];
}

/**
 * A case's status: whatever its most recent execution said.
 *
 * With one exception. A failed run whose corrective task has since been
 * finished is not still Failed - it is waiting to be run again, which is a
 * different thing and the thing a tester needs to see. Completing the fix
 * never marks the case Passed; only a tester running it again does that.
 */
export function uatCaseStatus(testCase: UatCase): UatStatus {
  const latest = testCase.runs[0];

  if (!latest) return "NOT_TESTED";

  if (latest.status === "FAILED" && latest.taskId) {
    const done = latest.taskStatus === "DONE" || latest.taskStatus === "APPROVED";

    if (done) return "RETEST_REQUIRED";
  }

  return latest.status;
}

/** The severity of a case that is currently failing, or null when it is not. */
export function openSeverity(testCase: UatCase): UatSeverity | null {
  const status = uatCaseStatus(testCase);

  if (status !== "FAILED" && status !== "RETEST_REQUIRED") return null;

  return testCase.runs[0]?.severity ?? testCase.severity;
}

export interface UatSummary {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  retestRequired: number;
  notTested: number;
  testing: number;
  open: Record<UatSeverity, number>;
  /** Passed as a share of everything that has actually been executed. */
  passRate: number | null;
  /** Modules with at least one case that has ever been run. */
  modulesCovered: string[];
  modulesUntested: string[];
}

export function uatSummary(cases: UatCase[]): UatSummary {
  const open: Record<UatSeverity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const covered = new Set<string>();
  const modules = new Set<string>();

  let passed = 0;
  let failed = 0;
  let blocked = 0;
  let retest = 0;
  let notTested = 0;
  let testing = 0;

  for (const testCase of cases) {
    modules.add(testCase.module);

    const status = uatCaseStatus(testCase);

    if (status === "PASSED") passed += 1;
    else if (status === "FAILED") failed += 1;
    else if (status === "BLOCKED") blocked += 1;
    else if (status === "RETEST_REQUIRED") retest += 1;
    else if (status === "TESTING") testing += 1;
    else notTested += 1;

    if (status !== "NOT_TESTED") covered.add(testCase.module);

    const severity = openSeverity(testCase);

    if (severity) open[severity] += 1;
  }

  /*
   * Out of what has been executed, not out of everything. A suite with four
   * hundred untested cases and eight passes is not 2% healthy - it is 100% of
   * a very small amount of testing, and the untested count says the rest.
   */
  const executed = passed + failed + retest;

  return {
    total: cases.length,
    passed,
    failed,
    blocked,
    retestRequired: retest,
    notTested,
    testing,
    open,
    passRate: executed === 0 ? null : Math.round((passed / executed) * 100),
    modulesCovered: [...covered].sort(),
    modulesUntested: [...modules].filter((m) => !covered.has(m)).sort(),
  };
}

export type UatReadiness =
  | "NOT_READY"
  | "TESTING_IN_PROGRESS"
  | "READY_FOR_RETESTING"
  | "READY_FOR_SIGN_OFF"
  | "READY_FOR_LIMITED_BETA";

export const UAT_READINESS_LABELS: Record<UatReadiness, string> = {
  NOT_READY: "Not ready",
  TESTING_IN_PROGRESS: "Testing in progress",
  READY_FOR_RETESTING: "Ready for retesting",
  READY_FOR_SIGN_OFF: "Ready for internal sign-off",
  READY_FOR_LIMITED_BETA: "Ready for Limited Beta",
};

export interface ReadinessVerdict {
  state: UatReadiness;
  /** Empty only when the state is READY_FOR_LIMITED_BETA. */
  blockers: string[];
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Whether this adds up to a Limited Beta, and if not, exactly what is missing.
 *
 * Reasons rather than a disabled button: "you cannot ship" is not useful
 * without "because two P1s are open and the permissions module has never been
 * run".
 */
export function uatReadiness(cases: UatCase[]): ReadinessVerdict {
  const summary = uatSummary(cases);
  const blockers: string[] = [];

  if (summary.total === 0) {
    return { state: "NOT_READY", blockers: ["No test cases have been written yet."] };
  }

  for (const severity of RELEASE_BLOCKING) {
    if (summary.open[severity] > 0) {
      blockers.push(`${plural(summary.open[severity], "open", "open")} ${severity} issue${summary.open[severity] === 1 ? "" : "s"}.`);
    }
  }

  if (summary.retestRequired > 0) {
    blockers.push(`${plural(summary.retestRequired, "test", "tests")} awaiting a retest.`);
  }

  if (summary.notTested > 0) {
    blockers.push(`${plural(summary.notTested, "test has", "tests have")} never been run.`);
  }

  if (summary.testing > 0) {
    blockers.push(`${plural(summary.testing, "test is", "tests are")} still in progress.`);
  }

  /*
   * Blocked is not a pass. A test nobody could execute is a question nobody
   * answered, and shipping on it is shipping on a guess.
   */
  if (summary.blocked > 0) {
    blockers.push(
      `${plural(summary.blocked, "test", "tests")} blocked and could not be executed.`,
    );
  }

  const criticalMissing = CRITICAL_MODULES.filter(
    (area) =>
      summary.modulesUntested.includes(area) || !summary.modulesCovered.includes(area),
  );

  for (const area of criticalMissing) {
    blockers.push(`${area} has not been tested.`);
  }

  if (blockers.length === 0) {
    return { state: "READY_FOR_LIMITED_BETA", blockers };
  }

  /* Which of the not-ready states, in order of how far along the suite is. */
  const state: UatReadiness =
    summary.open.P0 > 0 || summary.open.P1 > 0
      ? "NOT_READY"
      : summary.retestRequired > 0
        ? "READY_FOR_RETESTING"
        : summary.notTested > 0 || summary.testing > 0 || summary.blocked > 0
          ? "TESTING_IN_PROGRESS"
          : "READY_FOR_SIGN_OFF";

  return { state, blockers };
}
