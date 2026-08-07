import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  daysSinceAssessment,
  hasCurrentHealthAssessment,
  isComplaintOpen,
  isRecoveryPlanLive,
} from "@/lib/success/health-service";

describe("whether a health status is backed by an assessment", () => {
  it("accepts a status with an assessment behind it", () => {
    assert.equal(
      hasCurrentHealthAssessment({
        healthStatus: "GREEN",
        healthAssessments: [{ status: "GREEN" }],
      }),
      true,
    );
  });

  it("rejects a status with no assessment behind it", () => {
    // A colour nobody signed is what this requirement exists to catch: it can
    // be left over from a migration or an older version of the screen.
    assert.equal(
      hasCurrentHealthAssessment({ healthStatus: "GREEN", healthAssessments: [] }),
      false,
    );
  });

  it("rejects an unassessed account whatever the history says", () => {
    assert.equal(
      hasCurrentHealthAssessment({
        healthStatus: "NOT_ASSESSED",
        healthAssessments: [{ status: "GREEN" }],
      }),
      false,
    );
  });

  it("accepts red and yellow, not just green", () => {
    for (const status of ["RED", "YELLOW"] as const) {
      assert.equal(
        hasCurrentHealthAssessment({
          healthStatus: status,
          healthAssessments: [{ status }],
        }),
        true,
        `${status} should count as assessed`,
      );
    }
  });

  it("does not require the newest assessment to match the current status", () => {
    // The status is the snapshot of the newest assessment, but a stale pairing
    // is a data question, not a reason to claim nobody ever looked.
    assert.equal(
      hasCurrentHealthAssessment({
        healthStatus: "RED",
        healthAssessments: [{ status: "GREEN" }],
      }),
      true,
    );
  });
});

describe("assessment age", () => {
  const now = new Date("2026-08-08T12:00:00.000Z");

  it("is null when nothing has been assessed", () => {
    assert.equal(daysSinceAssessment(null, now), null);
  });

  it("counts whole days", () => {
    assert.equal(daysSinceAssessment(new Date("2026-08-01T12:00:00.000Z"), now), 7);
  });

  it("reports zero on the day itself", () => {
    assert.equal(daysSinceAssessment(new Date("2026-08-08T01:00:00.000Z"), now), 0);
  });
});

describe("open and live states", () => {
  it("treats logged, investigating, agreed and escalated complaints as open", () => {
    for (const status of ["LOGGED", "INVESTIGATING", "ACTION_AGREED", "ESCALATED"] as const) {
      assert.equal(isComplaintOpen(status), true, status);
    }
  });

  it("treats resolved and closed complaints as done", () => {
    assert.equal(isComplaintOpen("RESOLVED"), false);
    assert.equal(isComplaintOpen("CLOSED"), false);
  });

  it("treats draft, active and monitoring plans as live", () => {
    // A draft plan still counts: somebody has started writing it, which is
    // more than nothing, and it stops a red account being left bare.
    for (const status of ["DRAFT", "ACTIVE", "MONITORING"] as const) {
      assert.equal(isRecoveryPlanLive(status), true, status);
    }
  });

  it("treats finished plans as not live", () => {
    for (const status of ["SUCCEEDED", "FAILED", "CANCELLED"] as const) {
      assert.equal(isRecoveryPlanLive(status), false, status);
    }
  });
});
