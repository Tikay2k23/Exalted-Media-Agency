import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OPTIMIZATION_OUTCOMES,
  type OptimizationDetail,
  decisionForOutcome,
  isOpenState,
  isOverdueForReview,
  optimizationActions,
  optimizationName,
  optimizationState,
  sortOptimizations,
} from "@/lib/success/optimization-status";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString();

const row = (overrides: Partial<OptimizationDetail> = {}): OptimizationDetail => ({
  id: "o1",
  title: "Improve mobile page speed",
  platform: "Website",
  observedProblem: "Slow load times on mobile",
  proposedChange: "Compress hero images",
  hypothesis: null,
  evidence: null,
  expectedMetric: "Conversion rate",
  previousSetting: null,
  newSetting: null,
  metricBefore: null,
  metricAfter: null,
  notes: null,
  priority: "MEDIUM",
  serviceType: null,
  decision: "PENDING",
  result: null,
  startDate: null,
  endDate: null,
  cancelledAt: null,
  cancelledReason: null,
  completedAt: null,
  ownerId: "u1",
  ownerName: "Owner",
  createdByName: null,
  completedByName: null,
  cancelledByName: null,
  createdAt: day(-10),
  updatedAt: day(-10),
  task: null,
  ...overrides,
});

describe("optimization state", () => {
  it("calls an unstarted optimization planned", () => {
    assert.equal(optimizationState(row(), NOW), "PLANNED");
  });

  it("does not call a future start date work in progress", () => {
    /*
     * Scheduling next week's test is a plan. Counting it as running would
     * have the summary tile claim work nobody has done yet.
     */
    assert.equal(optimizationState(row({ startDate: day(3) }), NOW), "PLANNED");
    assert.equal(optimizationState(row({ startDate: day(-3) }), NOW), "IN_PROGRESS");
  });

  it("reads CONTINUE_TESTING as monitoring rather than inventing a status", () => {
    assert.equal(
      optimizationState(row({ startDate: day(-3), decision: "CONTINUE_TESTING" }), NOW),
      "MONITORING",
    );
  });

  it("treats every concluding decision as completed", () => {
    for (const decision of ["KEEP", "ADJUST", "REVERSE", "INCONCLUSIVE"]) {
      assert.equal(
        optimizationState(row({ startDate: day(-9), decision }), NOW),
        "COMPLETED",
        decision,
      );
    }
  });

  it("lets cancellation win over everything else", () => {
    assert.equal(
      optimizationState(row({ startDate: day(-9), decision: "KEEP", cancelledAt: day(-1) }), NOW),
      "CANCELLED",
    );
  });

  it("counts planned, running and monitoring as open and nothing else", () => {
    assert.deepEqual(
      (["PLANNED", "IN_PROGRESS", "MONITORING", "COMPLETED", "CANCELLED"] as const).map(isOpenState),
      [true, true, true, false, false],
    );
  });
});

describe("optimization actions", () => {
  it("offers only the moves the state allows", () => {
    assert.deepEqual(optimizationActions("PLANNED"), {
      start: true,
      monitor: false,
      complete: false,
      cancel: true,
      edit: true,
      note: true,
    });

    assert.deepEqual(optimizationActions("MONITORING"), {
      start: false,
      monitor: false,
      complete: true,
      cancel: true,
      edit: true,
      note: true,
    });
  });

  it("leaves history alone", () => {
    for (const state of ["COMPLETED", "CANCELLED"] as const) {
      const allowed = optimizationActions(state);

      assert.equal(
        Object.values(allowed).some(Boolean),
        false,
        `${state} should offer nothing`,
      );
    }
  });

  it("cannot complete something that never started", () => {
    assert.equal(optimizationActions("PLANNED").complete, false);
  });
});

describe("outcomes", () => {
  it("maps every offered outcome onto a decision the column accepts", () => {
    for (const outcome of OPTIMIZATION_OUTCOMES) {
      assert.ok(
        ["KEEP", "ADJUST", "REVERSE", "INCONCLUSIVE"].includes(
          decisionForOutcome(outcome.value) ?? "",
        ),
        outcome.value,
      );
    }
  });

  it("refuses an outcome it does not know", () => {
    assert.equal(decisionForOutcome("SPLENDID"), null);
  });

  it("distinguishes exceeded from met without inventing an enum value", () => {
    /* Both were kept. The difference is recorded, not stored as a status. */
    assert.equal(decisionForOutcome("EXCEEDED"), "KEEP");
    assert.equal(decisionForOutcome("MET"), "KEEP");
    assert.notEqual(
      OPTIMIZATION_OUTCOMES.find((o) => o.value === "EXCEEDED")?.label,
      OPTIMIZATION_OUTCOMES.find((o) => o.value === "MET")?.label,
    );
  });
});

describe("review dates", () => {
  it("flags an open optimization whose review date has passed", () => {
    assert.equal(isOverdueForReview(row({ startDate: day(-20), endDate: day(-2) }), NOW), true);
  });

  it("does not flag a concluded one, however old", () => {
    assert.equal(
      isOverdueForReview(row({ startDate: day(-20), endDate: day(-2), decision: "KEEP" }), NOW),
      false,
    );
  });

  it("does not flag one with no review date", () => {
    assert.equal(isOverdueForReview(row({ startDate: day(-20) }), NOW), false);
  });
});

describe("ordering", () => {
  it("puts live work first, by priority, and history after it", () => {
    const rows = [
      row({ id: "done", decision: "KEEP", startDate: day(-30), createdAt: day(-1) }),
      row({ id: "low", priority: "LOW", createdAt: day(-5) }),
      row({ id: "critical", priority: "CRITICAL", createdAt: day(-9) }),
    ];

    assert.deepEqual(
      sortOptimizations(rows, NOW).map((entry) => entry.id),
      ["critical", "low", "done"],
    );
  });
});

describe("naming", () => {
  it("falls back for rows written before titles existed", () => {
    const untitled = row({ title: null });

    assert.ok(optimizationName(untitled).startsWith("Website:"));
    assert.equal(optimizationName(row()), "Improve mobile page speed");
  });
});
