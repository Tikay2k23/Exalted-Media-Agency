import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  approvalGate,
  approvalSummary,
  defectSummary,
  launchSummary,
  qaSummary,
  runLaunchReview,
  type ApprovalRecord,
  type ApprovalRound,
  type DefectRow,
  type LaunchCheck,
  type QaCheck,
} from "@/lib/quality/approval-gate";

const NOW = new Date("2026-08-27T12:00:00.000Z");
const day = (offset: number) =>
  new Date(NOW.getTime() + offset * 86_400_000).toISOString();

const qaCheck = (overrides: Partial<QaCheck> = {}): QaCheck => ({
  id: "q1",
  objective: "Funnel tested",
  status: "PASSED",
  planName: "Launch QA",
  testerName: "Brad McLean",
  evidenceUrl: null,
  retestRequired: false,
  ...overrides,
});

const defect = (overrides: Partial<DefectRow> = {}): DefectRow => ({
  id: "d1",
  reference: "DEF-1",
  title: "Form confirmation email not firing",
  severity: "HIGH",
  status: "NEW",
  assignedToName: "Brad McLean",
  reportedAt: day(-5),
  dueDate: null,
  ...overrides,
});

const launchCheck = (overrides: Partial<LaunchCheck> = {}): LaunchCheck => ({
  id: "l1",
  label: "Funnel & pages live",
  category: "TECHNICAL",
  status: "COMPLETE",
  isRequired: true,
  evidenceUrl: null,
  ...overrides,
});

const round = (overrides: Partial<ApprovalRound> = {}): ApprovalRound => ({
  id: "r1",
  roundNumber: 1,
  status: "SENT",
  sentAt: day(-3),
  feedbackDeadline: day(4),
  approverName: "Tom Brennan",
  projectName: "Funnel Build",
  openRevisions: 0,
  ...overrides,
});

const record = (overrides: Partial<ApprovalRecord> = {}): ApprovalRecord => ({
  id: "a1",
  subject: "Funnel Build",
  approvedByName: "Tom Brennan",
  approvedAt: day(-1),
  evidenceUrl: "https://example.test/signoff.pdf",
  countsForLaunch: true,
  ...overrides,
});

/**
 * QA completion.
 *
 * Section 3: passed over applicable, and a check deliberately skipped is not
 * counted against the client either way.
 */
describe("QA summary", () => {
  it("counts passed over applicable, excluding what was skipped", () => {
    const summary = qaSummary([
      qaCheck({ id: "a" }),
      qaCheck({ id: "b" }),
      qaCheck({ id: "c", status: "NOT_RUN" }),
      qaCheck({ id: "d", status: "SKIPPED" }),
    ]);

    // Three applicable, two passed.
    assert.equal(summary.total, 3);
    assert.equal(summary.percent, 67);
    assert.equal(summary.complete, false);
  });

  it("is not complete on an empty plan", () => {
    // Nothing configured is not the same as everything passing.
    const summary = qaSummary([]);

    assert.equal(summary.complete, false);
    assert.equal(summary.percent, 0);
    assert.equal(summary.label, "Not configured");
  });

  it("reads as failing while any check has failed", () => {
    const summary = qaSummary([qaCheck({ id: "a" }), qaCheck({ id: "b", status: "FAILED" })]);

    assert.equal(summary.label, "Failing");
    assert.equal(summary.failed, 1);
    assert.equal(summary.complete, false);
  });

  it("counts a check flagged for retest even when its status has moved on", () => {
    const summary = qaSummary([qaCheck({ status: "PASSED", retestRequired: true })]);

    assert.equal(summary.awaitingRetest, 1);
  });
});

describe("defect summary", () => {
  it("counts work-in-hand statuses as open and closed ones as not", () => {
    const summary = defectSummary([
      defect({ id: "1", status: "NEW" }),
      defect({ id: "2", status: "IN_PROGRESS" }),
      defect({ id: "3", status: "READY_FOR_RETEST" }),
      defect({ id: "4", status: "REOPENED" }),
      defect({ id: "5", status: "CLOSED" }),
      defect({ id: "6", status: "PASSED" }),
      defect({ id: "7", status: "WONT_FIX" }),
    ]);

    assert.equal(summary.total, 4);
  });

  it("keeps a fix nobody has retested on the open list", () => {
    /*
     * The fix is in and unconfirmed. Closing on the strength of that is how a
     * defect reappears in front of the client.
     */
    const summary = defectSummary([defect({ status: "READY_FOR_RETEST" })]);

    assert.equal(summary.total, 1);
    assert.equal(summary.awaitingRetest.length, 1);
  });

  it("separates the severities that should stop a client seeing the work", () => {
    const summary = defectSummary([
      defect({ id: "1", severity: "CRITICAL" }),
      defect({ id: "2", severity: "HIGH" }),
      defect({ id: "3", severity: "MEDIUM" }),
      defect({ id: "4", severity: "LOW" }),
    ]);

    assert.equal(summary.total, 4);
    assert.equal(summary.blocking.length, 2);
  });
});

describe("approval summary", () => {
  it("is not requested when nobody has been asked", () => {
    const summary = approvalSummary([], [], NOW);

    assert.equal(summary.state, "NOT_REQUESTED");
    assert.equal(summary.round, null);
  });

  it("honours a sign-off captured outside a review cycle", () => {
    // A client who confirmed on a call is approved, process or no process.
    const summary = approvalSummary([], [record()], NOW);

    assert.equal(summary.state, "APPROVED");
  });

  it("waits on the client once a round has gone out", () => {
    const summary = approvalSummary([round()], [], NOW);

    assert.equal(summary.state, "WAITING_ON_CLIENT");
    assert.equal(summary.approverName, "Tom Brennan");
  });

  it("goes overdue once the deadline passes", () => {
    const summary = approvalSummary([round({ feedbackDeadline: day(-4) })], [], NOW);

    assert.equal(summary.state, "OVERDUE");
    assert.equal(summary.daysOverdue, 4);
  });

  it("reads open revision items as revisions required", () => {
    const summary = approvalSummary([round({ openRevisions: 3 })], [], NOW);

    assert.equal(summary.state, "REVISIONS_REQUIRED");
  });

  it("does not call an account approved on the strength of an older round", () => {
    /*
     * Round one approved, round two out for review. Reading the record alone
     * would report this client as signed off on work they have not seen.
     */
    const summary = approvalSummary(
      [round({ id: "r1", roundNumber: 1, status: "APPROVED" }), round({ id: "r2", roundNumber: 2 })],
      [record()],
      NOW,
    );

    assert.equal(summary.state, "WAITING_ON_CLIENT");
    assert.equal(summary.round?.roundNumber, 2);
  });

  it("ignores a withdrawn sign-off", () => {
    const summary = approvalSummary([], [record({ countsForLaunch: false })], NOW);

    assert.equal(summary.state, "NOT_REQUESTED");
  });
});

describe("launch summary", () => {
  it("counts complete over applicable and names what blocks", () => {
    const summary = launchSummary([
      launchCheck({ id: "1" }),
      launchCheck({ id: "2" }),
      launchCheck({ id: "3", status: "IN_PROGRESS", label: "Tracking verified" }),
      launchCheck({ id: "4", status: "PENDING", label: "Backup verified" }),
      launchCheck({ id: "5", status: "NOT_APPLICABLE" }),
    ]);

    assert.equal(summary.total, 4);
    assert.equal(summary.complete, 2);
    assert.equal(summary.remaining, 2);
    assert.deepEqual(summary.blocking.map((c) => c.label), ["Tracking verified", "Backup verified"]);
    assert.equal(summary.ready, false);
  });

  it("does not let an optional check block the launch", () => {
    const summary = launchSummary([
      launchCheck({ id: "1" }),
      launchCheck({ id: "2", status: "PENDING", isRequired: false }),
    ]);

    assert.equal(summary.blocking.length, 0);
    assert.equal(summary.ready, true);
  });

  it("is not ready when no checks are configured", () => {
    // An empty checklist is an unconfigured launch, not a cleared one.
    assert.equal(launchSummary([]).ready, false);
  });
});

/* -------------------------------------------------------------------------- */

function gateFor(overrides: Partial<Parameters<typeof approvalGate>[0]> = {}) {
  return approvalGate({
    qa: [qaCheck()],
    defects: [],
    rounds: [],
    records: [],
    launch: [launchCheck()],
    now: NOW,
    ...overrides,
  });
}

/**
 * The gate.
 *
 * The order of the arms is the order the work happens in, so the state can
 * never run ahead of itself.
 */
describe("approval gate", () => {
  it("cannot report a launch problem before QA has passed", () => {
    const gate = gateFor({
      qa: [qaCheck({ status: "NOT_RUN" })],
      launch: [launchCheck({ status: "PENDING" })],
    });

    assert.equal(gate.state, "QA_IN_PROGRESS");
  });

  it("puts a blocking defect above an incomplete checklist", () => {
    const gate = gateFor({ defects: [defect({ severity: "CRITICAL" })] });

    assert.equal(gate.state, "QA_FAILING");
    assert.equal(gate.health, "BLOCKED");
  });

  it("asks for approval once QA passes and nobody has been asked", () => {
    const gate = gateFor();

    assert.equal(gate.state, "QA_READY");
  });

  it("waits on the client while a round is out", () => {
    const gate = gateFor({ rounds: [round()] });

    assert.equal(gate.state, "WAITING_ON_CLIENT");
  });

  it("blocks the launch when approval is in but checks are not", () => {
    const gate = gateFor({
      rounds: [round({ status: "APPROVED" })],
      launch: [launchCheck(), launchCheck({ id: "2", status: "PENDING" })],
    });

    assert.equal(gate.state, "LAUNCH_BLOCKED");
  });

  it("reaches launch review only when everything is genuinely clear", () => {
    const gate = gateFor({ rounds: [round({ status: "APPROVED" })] });

    assert.equal(gate.state, "READY_FOR_LAUNCH_REVIEW");
    assert.equal(runLaunchReview(gate).passed, true);
  });

  it("never reports blocked as a merely low score", () => {
    /*
     * One critical defect and everything else perfect scores well. The state
     * is decided from the fact, not from the number.
     */
    const gate = gateFor({
      rounds: [round({ status: "APPROVED" })],
      defects: [defect({ severity: "CRITICAL" })],
    });

    assert.ok(gate.healthScore > 60);
    assert.equal(gate.health, "BLOCKED");
  });

  it("explains itself: every factor carries a reason", () => {
    const gate = gateFor({ defects: [defect()], rounds: [round()] });

    assert.equal(gate.factors.length, 5);
    for (const factor of gate.factors) {
      assert.ok(factor.detail.length > 5, `${factor.label} has no explanation`);
      assert.ok(factor.score >= 0 && factor.score <= 100, `${factor.label} is out of range`);
    }
    assert.ok(gate.risks.length > 0);
  });
});

describe("launch review", () => {
  it("names every failure rather than answering yes or no", () => {
    const gate = gateFor({
      qa: [qaCheck({ status: "NOT_RUN" })],
      defects: [defect({ severity: "CRITICAL", title: "Checkout throws" })],
      launch: [launchCheck({ status: "PENDING", label: "Backup verified" })],
    });

    const result = runLaunchReview(gate);

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => /Internal QA/.test(f)));
    assert.ok(result.failures.some((f) => /Checkout throws/.test(f)));
    assert.ok(result.failures.some((f) => /Client approval/.test(f)));
    assert.ok(result.failures.some((f) => /Backup verified/.test(f)));
  });

  it("refuses a launch with no checklist rather than passing it", () => {
    const gate = gateFor({ rounds: [round({ status: "APPROVED" })], launch: [] });
    const result = runLaunchReview(gate);

    assert.equal(result.passed, false);
    assert.ok(result.failures.some((f) => /no checks configured/i.test(f)));
  });
});
