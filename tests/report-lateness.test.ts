import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OPTIMIZATION_DECISIONS,
  REPORT_TYPES,
  isOptimizationConcluded,
  isReportLate,
} from "@/lib/success/report-service";

const now = new Date("2026-08-08T12:00:00.000Z");
const yesterday = new Date("2026-08-07T12:00:00.000Z");
const tomorrow = new Date("2026-08-09T12:00:00.000Z");

describe("report lateness", () => {
  it("is not late when no due date was set", () => {
    // Plenty of reports are prepared without a promised date. Inventing
    // lateness for them would train people to ignore the flag.
    assert.equal(
      isReportLate({ status: "DRAFT", dueAt: null, sentAt: null }, now),
      false,
    );
  });

  it("is not late before the due date", () => {
    assert.equal(
      isReportLate({ status: "DRAFT", dueAt: tomorrow, sentAt: null }, now),
      false,
    );
  });

  it("is late once the due date has passed and nothing has been sent", () => {
    assert.equal(
      isReportLate({ status: "IN_REVIEW", dueAt: yesterday, sentAt: null }, now),
      true,
    );
  });

  it("judges a sent report on when it was sent, not on today", () => {
    // A report sent late stays late forever, and one sent on time does not
    // become late because time passed afterwards.
    assert.equal(
      isReportLate({ status: "SENT", dueAt: tomorrow, sentAt: now }, now),
      false,
    );
    assert.equal(
      isReportLate({ status: "SENT", dueAt: yesterday, sentAt: now }, now),
      true,
    );
  });

  it("keeps a late sent report late even after the client acknowledges it", () => {
    assert.equal(
      isReportLate({ status: "ACKNOWLEDGED", dueAt: yesterday, sentAt: now }, now),
      true,
    );
  });

  it("does not call an acknowledged report late when nothing was ever sent", () => {
    // Defensive: an acknowledged report with no sentAt is a data oddity, not
    // something to shout about on the client's page.
    assert.equal(
      isReportLate({ status: "ACKNOWLEDGED", dueAt: yesterday, sentAt: null }, now),
      false,
    );
  });

  it("is not late at the exact moment it is due", () => {
    assert.equal(isReportLate({ status: "DRAFT", dueAt: now, sentAt: null }, now), false);
  });
});

describe("optimization decisions", () => {
  it("treats keep, adjust, reverse and inconclusive as concluded", () => {
    for (const decision of ["KEEP", "ADJUST", "REVERSE", "INCONCLUSIVE"] as const) {
      assert.equal(isOptimizationConcluded(decision), true, decision);
    }
  });

  it("does not treat pending or continue-testing as concluded", () => {
    // Both mean the experiment is still running, so neither should demand a
    // result yet.
    assert.equal(isOptimizationConcluded("PENDING"), false);
    assert.equal(isOptimizationConcluded("CONTINUE_TESTING"), false);
  });

  it("offers every decision SOP 32 lists", () => {
    const values: string[] = OPTIMIZATION_DECISIONS.map((option) => option.value);

    for (const expected of ["KEEP", "ADJUST", "REVERSE", "CONTINUE_TESTING", "INCONCLUSIVE"]) {
      assert.ok(values.includes(expected), `${expected} should be offered`);
    }
  });
});

describe("report types", () => {
  it("offers every report SOP 31 lists", () => {
    const values: string[] = REPORT_TYPES.map((option) => option.value);

    for (const expected of [
      "WEEKLY_UPDATE",
      "MONTHLY_REPORT",
      "QUARTERLY_BUSINESS_REVIEW",
      "LAUNCH_REPORT",
      "FINAL_REPORT",
    ]) {
      assert.ok(values.includes(expected), `${expected} should be offered`);
    }
  });
});
