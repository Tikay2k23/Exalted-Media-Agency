import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type UatCase,
  type UatRun,
  openSeverity,
  uatCaseStatus,
  uatReadiness,
  uatSummary,
} from "@/lib/governance/uat";

const run = (overrides: Partial<UatRun> = {}): UatRun => ({
  id: "r1",
  runNumber: 1,
  status: "PASSED",
  severity: null,
  actualResult: null,
  blockedReason: null,
  testerName: "Tester",
  testedAt: "2026-08-29T09:00:00.000Z",
  taskId: null,
  ...overrides,
});

const testCase = (overrides: Partial<UatCase> = {}): UatCase => ({
  id: "c1",
  reference: "UAT-0001",
  module: "Journey",
  name: "A case",
  severity: "P2",
  releaseScope: "LIMITED_BETA_REQUIRED",
  scopeReason: null,
  runs: [],
  ...overrides,
});

/** A suite that would otherwise be ready, so one flaw can be tested at a time. */
function readySuite(): UatCase[] {
  return [
    "Permissions",
    "Data Consistency",
    "End-to-End Lifecycle",
    "Journey",
    "Approvals",
    "Work",
  ].map((module, index) =>
    testCase({
      id: `c${index}`,
      reference: `UAT-000${index}`,
      module,
      runs: [run()],
    }),
  );
}

describe("a case's status is its latest run", () => {
  it("is not tested until somebody runs it", () => {
    assert.equal(uatCaseStatus(testCase()), "NOT_TESTED");
  });

  it("reads the newest run, not the first", () => {
    const c = testCase({
      runs: [run({ runNumber: 2, status: "PASSED" }), run({ runNumber: 1, status: "FAILED" })],
    });

    assert.equal(uatCaseStatus(c), "PASSED");
  });

  it("keeps the failed attempt in the history", () => {
    const c = testCase({
      runs: [run({ runNumber: 2, status: "PASSED" }), run({ runNumber: 1, status: "FAILED" })],
    });

    assert.equal(c.runs.length, 2, "history is never overwritten");
    assert.equal(c.runs[1].status, "FAILED");
  });
});

describe("finishing the fix does not pass the test", () => {
  it("moves a failed case to retest, never to passed", () => {
    const c = testCase({
      runs: [run({ status: "FAILED", severity: "P1", taskId: "t1", taskStatus: "DONE" })],
    });

    /*
     * The whole point of the phase: a developer finishing the corrective work
     * is not a tester confirming the behaviour.
     */
    assert.equal(uatCaseStatus(c), "RETEST_REQUIRED");
    assert.notEqual(uatCaseStatus(c), "PASSED");
  });

  it("stays failed while the fix is still open", () => {
    const c = testCase({
      runs: [run({ status: "FAILED", severity: "P1", taskId: "t1", taskStatus: "IN_PROGRESS" })],
    });

    assert.equal(uatCaseStatus(c), "FAILED");
  });

  it("keeps the severity of a case awaiting retest", () => {
    const c = testCase({
      runs: [run({ status: "FAILED", severity: "P0", taskId: "t1", taskStatus: "DONE" })],
    });

    /* Still counts against the release: it is not fixed until it is proven. */
    assert.equal(openSeverity(c), "P0");
  });
});

describe("summary", () => {
  it("rates the pass rate against what was executed, not the whole backlog", () => {
    const cases = [
      testCase({ id: "a", runs: [run({ status: "PASSED" })] }),
      testCase({ id: "b", runs: [run({ status: "FAILED", severity: "P2" })] }),
      testCase({ id: "c", runs: [] }),
      testCase({ id: "d", runs: [] }),
    ];

    const summary = uatSummary(cases);

    assert.equal(summary.passRate, 50, "one of two executed");
    assert.equal(summary.notTested, 2, "and the rest is said plainly");
  });

  it("has no pass rate before anything is executed", () => {
    assert.equal(uatSummary([testCase()]).passRate, null);
  });

  it("counts open issues by severity", () => {
    const cases = [
      testCase({ id: "a", runs: [run({ status: "FAILED", severity: "P0" })] }),
      testCase({ id: "b", runs: [run({ status: "FAILED", severity: "P2" })] }),
      testCase({ id: "c", runs: [run({ status: "PASSED" })] }),
    ];

    const summary = uatSummary(cases);

    assert.equal(summary.open.P0, 1);
    assert.equal(summary.open.P2, 1);
    assert.equal(summary.open.P1, 0);
  });
});

describe("readiness is calculated, never set", () => {
  it("approves only a suite with nothing outstanding", () => {
    const verdict = uatReadiness(readySuite());

    assert.equal(verdict.state, "READY_FOR_LIMITED_BETA");
    assert.deepEqual(verdict.blockers, []);
  });

  it("refuses while a P1 is open, and says so", () => {
    const cases = readySuite();
    cases[0].runs = [run({ status: "FAILED", severity: "P1" })];

    const verdict = uatReadiness(cases);

    assert.equal(verdict.state, "NOT_READY");
    assert.ok(verdict.blockers.some((b) => b.includes("P1")));
  });

  it("refuses while a P0 is open", () => {
    const cases = readySuite();
    cases[0].runs = [run({ status: "FAILED", severity: "P0" })];

    assert.equal(uatReadiness(cases).state, "NOT_READY");
  });

  it("does not treat a blocked test as a pass", () => {
    const cases = readySuite();
    cases[0].runs = [run({ status: "BLOCKED", blockedReason: "no mail service" })];

    const verdict = uatReadiness(cases);

    assert.notEqual(verdict.state, "READY_FOR_LIMITED_BETA");
    assert.ok(verdict.blockers.some((b) => b.includes("blocked")));
  });

  it("refuses while a critical module has never been run", () => {
    const cases = readySuite();
    /* Permissions present but never executed. */
    cases[0].runs = [];

    const verdict = uatReadiness(cases);

    assert.notEqual(verdict.state, "READY_FOR_LIMITED_BETA");
    assert.ok(verdict.blockers.some((b) => b.includes("Permissions")));
  });

  it("does not let future scope hold up the release", () => {
    const cases = readySuite();

    cases.push(
      testCase({
        id: "future",
        reference: "UAT-9999",
        module: "Integrations",
        name: "Something not built yet",
        releaseScope: "FUTURE_OUT_OF_SCOPE",
        scopeReason: "No provider is part of Limited Beta.",
        runs: [],
      }),
    );

    assert.equal(uatReadiness(cases).state, "READY_FOR_LIMITED_BETA");
  });

  it("will not let out-of-scope hide a P0", () => {
    /*
     * The rule that stops scope becoming a way to ship a hole: severity wins.
     */
    const cases = readySuite();

    cases.push(
      testCase({
        id: "hole",
        reference: "UAT-9998",
        module: "Permissions",
        name: "Cross-client isolation",
        severity: "P0",
        releaseScope: "FUTURE_OUT_OF_SCOPE",
        scopeReason: "Somebody tried to scope this away.",
        runs: [],
      }),
    );

    const verdict = uatReadiness(cases);

    assert.notEqual(verdict.state, "READY_FOR_LIMITED_BETA");
    assert.ok(verdict.blockers.some((b) => b.includes("never been run")));
  });

  it("refuses an empty suite rather than approving a vacuum", () => {
    /*
     * Nothing tested is not the same as nothing wrong. Every count is zero
     * here, and a naive check on "no open P0s" would ship it.
     */
    const verdict = uatReadiness([]);

    assert.equal(verdict.state, "NOT_READY");
    assert.equal(verdict.blockers.length, 1);
  });

  it("always explains itself when it refuses", () => {
    const cases = readySuite();
    cases[0].runs = [run({ status: "FAILED", severity: "P1" })];
    cases[1].runs = [];

    const verdict = uatReadiness(cases);

    assert.ok(verdict.blockers.length >= 2, "every reason, not just the first");
  });
});
