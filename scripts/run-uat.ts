import "dotenv/config";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { recordUatRun } from "@/lib/governance/uat-service";
import { loadUatCases } from "@/lib/governance/uat-service";
import { gatesBeta, uatReadiness, uatSummary } from "@/lib/governance/uat";

/**
 * Records the UAT runs that were actually executed.
 *
 * Every result below came from running something and reading what happened -
 * a probe, an integration test, a measurement. Nothing is passed because the
 * code looked correct: reading the report lifecycle earlier this week said it
 * was unscoped and the probe said otherwise, which is exactly why inspection
 * is not a pass.
 *
 * Everything not listed here stays Not Tested, and the cases that were
 * attempted and could not be completed are recorded as Blocked with the reason.
 *
 * Idempotent by name: a case that already has a run for the same evidence is
 * left alone, so this can be re-run as more of the suite is executed.
 */

type Result = {
  /** Matched on the case name, which is unique enough within a module. */
  name: string;
  status: "PASSED" | "FAILED" | "BLOCKED";
  actualResult?: string;
  severity?: "P0" | "P1" | "P2" | "P3";
  blockedReason?: string;
};

const RESULTS: Result[] = [
  /* ------------------------------------------------------------ executed -- */
  {
    name: "A record id from another client is not a way in",
    status: "PASSED",
    actualResult:
      "Retest after the fix. As a creative specialist who can see only their own accounts, "
      + "attempted updateDefect, closeDefect and addQaTest against another client's records, "
      + "plus changeTaskStatus, updateAccessRecord, submitReportForReview and startOptimization. "
      + "All refused. Defects, tasks, reports and optimizations answer NOT_FOUND; access answers "
      + "FORBIDDEN. Covered by tests/defect-client-scope.integration.test.ts, which fails on the "
      + "commit before the fix.",
  },
  {
    name: "Offboarded clients never remain active",
    status: "PASSED",
    actualResult:
      "Queried for clients whose offboarding is COMPLETE and whose status is not COMPLETED: 0 rows. "
      + "Behaviour covered by tests/offboarding-completion.integration.test.ts, which fails on the "
      + "commit before the fix.",
  },
  {
    name: "No optimization is concluded without a result",
    status: "PASSED",
    actualResult:
      "Queried optimizations with a concluding decision and a null result: 0 rows. completeOptimization "
      + "refuses without a result and both metric readings; verified by probe.",
  },
  {
    name: "Offboarding cannot complete while a blocking step is open",
    status: "PASSED",
    actualResult:
      "Started offboarding and attempted to complete it immediately: refused with INCOMPLETE and "
      + "seven named outstanding steps. The refused attempt changed nothing.",
  },
  {
    name: "Completing offboarding ends the engagement",
    status: "PASSED",
    actualResult:
      "Ticked every step, completed offboarding: client status moved to COMPLETED and isActive() "
      + "now excludes it. The status change is logged once, and saving completion again does not "
      + "log it twice.",
  },
  {
    name: "No credential is ever stored in plain text",
    status: "PASSED",
    actualResult:
      "AccessRecord stores credentialLocation only - there is no password column. The credential "
      + "guard rejects values that look like credentials while allowing the notes people actually "
      + "write; 14 tests in tests/credential-guard.test.ts pass.",
  },
  {
    name: "A client with hundreds of tasks still opens quickly",
    status: "PASSED",
    actualResult:
      "Seeded 400 tasks and 4,000 activity rows on one account. The client page data path runs in "
      + "58ms (mean of five runs, two waves) against 81ms sequential before the fix. Payload is "
      + "302 KB, down from 479 KB, after bounding the task include and moving the counts to "
      + "database aggregates.",
  },
  {
    name: "Completing an optimization requires the measurement",
    status: "PASSED",
    actualResult:
      "Attempted to complete an optimization with empty metric before/after: refused with INVALID. "
      + "An unrecognised outcome is also refused. Verified by probe.",
  },

  /* ------------------------------------------------------------- blocked -- */
  {
    name: "Connect starts a real authentication flow",
    status: "BLOCKED",
    blockedReason:
      "There is no integration backend to test: no provider model, no stored credentials, no OAuth "
      + "client registration and no sync service. The page states this rather than showing a Connect "
      + "button that would do nothing. Needs provider app registration and credentials before it can "
      + "be executed.",
  },
  {
    name: "Lead to archive without touching the database",
    status: "BLOCKED",
    blockedReason:
      "Requires an authenticated browser session to drive the interface, which this environment does "
      + "not have - the in-app browser is signed out and the Chrome extension is not connected. Two "
      + "steps of the lifecycle also have no implementation yet: archive does not exist, so the run "
      + "cannot reach its final state.",
  },
  {
    name: "A sent report keeps its numbers when the data moves on",
    status: "BLOCKED",
    blockedReason:
      "There is no metrics store, so a report has no metric snapshot to preserve or to contradict. "
      + "The test becomes meaningful once performance data is recorded against reports.",
  },
];

async function main() {
  const admin = await prisma.user.findFirstOrThrow({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });

  const actor = await loadAuthContext(admin.id);

  if (!actor) throw new Error("no actor");

  let recorded = 0;
  let skipped = 0;

  for (const result of RESULTS) {
    const testCase = await prisma.uatTestCase.findFirst({
      where: { name: result.name },
      select: { id: true, reference: true, runs: { select: { id: true } } },
    });

    if (!testCase) {
      console.error(`  no such case: ${result.name}`);
      continue;
    }

    if (testCase.runs.length > 0) {
      skipped += 1;
      continue;
    }

    const run = await recordUatRun({
      actor,
      testCaseId: testCase.id,
      status: result.status,
      actualResult: result.actualResult,
      severity: result.severity,
      blockedReason: result.blockedReason,
      environment: "DEVELOPMENT",
    });

    if (!run.ok) {
      console.error(`  ${testCase.reference}: ${run.message}`);
      continue;
    }

    recorded += 1;
  }

  console.log(`Recorded ${recorded} runs, ${skipped} already had one.\n`);

  const cases = await loadUatCases();
  const summary = uatSummary(cases);
  const verdict = uatReadiness(cases);

  const beta = cases.filter(gatesBeta);
  const betaSummary = uatSummary(beta);

  console.log("=== catalogue ===");
  console.log(`  total       ${summary.total}`);
  console.log(`  passed      ${summary.passed}`);
  console.log(`  failed      ${summary.failed}`);
  console.log(`  blocked     ${summary.blocked}`);
  console.log(`  retest      ${summary.retestRequired}`);
  console.log(`  not tested  ${summary.notTested}`);
  console.log(`  pass rate   ${summary.passRate === null ? "n/a" : `${summary.passRate}%`} (of executed)`);
  console.log(`  open        P0 ${summary.open.P0}  P1 ${summary.open.P1}  P2 ${summary.open.P2}  P3 ${summary.open.P3}`);
  console.log("");
  console.log("=== limited beta gate ===");
  console.log(`  required    ${betaSummary.total}`);
  console.log(`  passed      ${betaSummary.passed}`);
  console.log(`  failed      ${betaSummary.failed}`);
  console.log(`  blocked     ${betaSummary.blocked}`);
  console.log(`  retest      ${betaSummary.retestRequired}`);
  console.log(`  not tested  ${betaSummary.notTested}`);
  console.log(
    `  executed    ${betaSummary.passed + betaSummary.failed + betaSummary.retestRequired} of ${betaSummary.total}`,
  );

  console.log(`\n  readiness   ${verdict.state}`);

  for (const blocker of verdict.blockers) console.log(`    - ${blocker}`);
}

main().finally(() => prisma.$disconnect());
