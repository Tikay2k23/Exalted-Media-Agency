import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type RaisedCondition,
  ageInDays,
  blocksStage,
  canFollowUp,
  daysSinceFollowUp,
  dependencyStatus,
  isOpen,
  summarise,
} from "@/lib/journey/dependency";

const NOW = new Date("2026-08-20T12:00:00.000Z");

function days(offset: number) {
  const date = new Date(NOW);

  date.setDate(date.getDate() + offset);

  return date.toISOString();
}

function condition(overrides: Partial<RaisedCondition> = {}): RaisedCondition {
  return {
    kind: "WAITING_ON_CLIENT",
    dueAt: days(3),
    raisedAt: days(-2),
    lastFollowUpAt: null,
    followUpCount: 0,
    receivedAt: null,
    resolvedAt: null,
    cancelledAt: null,
    severity: null,
    impact: null,
    expectedResolutionAt: null,
    ...overrides,
  };
}

/**
 * Status is derived, never stored.
 *
 * A status column beside these timestamps is a second source of truth for one
 * fact, and the first time somebody writes one without the other the page
 * starts lying about a client who has already answered.
 */
describe("dependency status", () => {
  it("starts as requested", () => {
    assert.equal(dependencyStatus(condition(), NOW), "REQUESTED");
  });

  it("becomes waiting once somebody has chased it", () => {
    assert.equal(
      dependencyStatus(condition({ followUpCount: 1, lastFollowUpAt: days(-1) }), NOW),
      "WAITING",
    );
  });

  it("becomes overdue once the date passes", () => {
    assert.equal(dependencyStatus(condition({ dueAt: days(-1) }), NOW), "OVERDUE");
  });

  it("reads received when the client has answered but nobody has checked", () => {
    assert.equal(dependencyStatus(condition({ receivedAt: days(-1) }), NOW), "RECEIVED");
  });

  it("keeps received separate from resolved, because they are different moves", () => {
    const answered = condition({ receivedAt: days(-1) });
    const checked = condition({ receivedAt: days(-1), resolvedAt: days(0) });

    assert.equal(dependencyStatus(answered, NOW), "RECEIVED");
    assert.equal(dependencyStatus(checked, NOW), "RESOLVED");
    assert.equal(isOpen(answered), true, "an unchecked answer is still open work");
    assert.equal(isOpen(checked), false);
  });

  it("does not call a closed item overdue, whatever its due date said", () => {
    const late = { dueAt: days(-9) };

    assert.equal(dependencyStatus(condition({ ...late, resolvedAt: days(-1) }), NOW), "RESOLVED");
    assert.equal(dependencyStatus(condition({ ...late, cancelledAt: days(-1) }), NOW), "CANCELLED");
  });

  it("keeps cancelled apart from resolved", () => {
    // Descoped is not delivered, and a report that cannot tell them apart
    // credits the agency for work it talked its way out of.
    assert.equal(dependencyStatus(condition({ cancelledAt: days(-1) }), NOW), "CANCELLED");
  });
});

/**
 * What actually holds a stage shut.
 *
 * Impact decides, not kind. An agency blocked on something that does not stop
 * the stage should still record it, and it will stop recording anything if
 * every blocker freezes delivery.
 */
describe("what blocks the stage", () => {
  it("blocks when the impact says so", () => {
    assert.equal(blocksStage(condition({ kind: "BLOCKED", impact: "BLOCKS_STAGE" })), true);
  });

  it("does not block when the impact says it does not", () => {
    assert.equal(blocksStage(condition({ kind: "BLOCKED", impact: "NO_BLOCK" })), false);
    assert.equal(blocksStage(condition({ kind: "BLOCKED", impact: "DELAYS_MILESTONE" })), false);
  });

  it("falls back on kind for records raised before impact existed", () => {
    assert.equal(blocksStage(condition({ kind: "BLOCKED", impact: null })), true);
    assert.equal(blocksStage(condition({ kind: "WAITING_ON_CLIENT", impact: null })), true);
    assert.equal(blocksStage(condition({ kind: "PAUSED", impact: null })), false);
  });

  it("stops blocking the moment it is closed", () => {
    assert.equal(
      blocksStage(condition({ kind: "BLOCKED", impact: "BLOCKS_STAGE", resolvedAt: days(0) })),
      false,
    );
  });
});

describe("chasing", () => {
  it("says nothing about a follow-up nobody has made", () => {
    assert.equal(daysSinceFollowUp(condition(), NOW), null);
  });

  it("allows the first chase immediately", () => {
    assert.equal(canFollowUp(condition(), NOW), true);
  });

  it("refuses a second chase on the same day", () => {
    const chased = condition({ lastFollowUpAt: days(0), followUpCount: 1 });

    assert.equal(canFollowUp(chased, NOW), false);
  });

  it("allows it again the next day", () => {
    const chased = condition({ lastFollowUpAt: days(-1), followUpCount: 1 });

    assert.equal(canFollowUp(chased, NOW), true);
  });

  it("never offers to chase something already closed", () => {
    assert.equal(canFollowUp(condition({ resolvedAt: days(-1) }), NOW), false);
    assert.equal(canFollowUp(condition({ cancelledAt: days(-1) }), NOW), false);
  });

  it("counts how long it has been outstanding", () => {
    assert.equal(ageInDays(condition({ raisedAt: days(-6) }), NOW), 6);
  });
});

describe("summary", () => {
  it("counts nothing as nothing", () => {
    assert.deepEqual(summarise([], NOW), {
      open: 0,
      overdue: 0,
      received: 0,
      oldestDays: 0,
      blocking: false,
    });
  });

  it("leaves closed items out of the counts", () => {
    const summary = summarise(
      [condition(), condition({ resolvedAt: days(-1) }), condition({ cancelledAt: days(-1) })],
      NOW,
    );

    assert.equal(summary.open, 1);
  });

  it("reports the oldest open item, not the oldest of everything", () => {
    const summary = summarise(
      [
        condition({ raisedAt: days(-2) }),
        condition({ raisedAt: days(-30), resolvedAt: days(-1) }),
      ],
      NOW,
    );

    assert.equal(summary.oldestDays, 2);
  });

  it("only calls the stage blocked when something open actually blocks it", () => {
    assert.equal(
      summarise([condition({ kind: "BLOCKED", impact: "NO_BLOCK" })], NOW).blocking,
      false,
    );
    assert.equal(
      summarise([condition({ kind: "BLOCKED", impact: "BLOCKS_STAGE" })], NOW).blocking,
      true,
    );
  });

  it("counts overdue and received separately", () => {
    const summary = summarise(
      [condition({ dueAt: days(-1) }), condition({ receivedAt: days(-1) })],
      NOW,
    );

    assert.equal(summary.overdue, 1);
    assert.equal(summary.received, 1);
    assert.equal(summary.open, 2);
  });
});
