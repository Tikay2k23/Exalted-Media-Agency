import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ReadinessLaunch,
  deriveLaunchReadiness,
} from "@/lib/launch/launch-service";

const VERIFIED = new Date("2026-08-05");

function launch(overrides: Partial<ReadinessLaunch> = {}): ReadinessLaunch {
  return {
    ownerId: "owner-1",
    backupVerifiedAt: VERIFIED,
    rollbackPlan: "Restore the snapshot and repoint DNS to the old host.",
    isFrozen: false,
    checklistItems: [
      { label: "Backup verified", isRequired: true, status: "COMPLETE" },
      { label: "Forms tested", isRequired: true, status: "COMPLETE" },
    ],
    ...overrides,
  };
}

describe("launch readiness", () => {
  it("is ready when everything is in place", () => {
    const readiness = deriveLaunchReadiness(launch());

    assert.equal(readiness.ready, true);
    assert.deepEqual(readiness.blockers, []);
    assert.equal(readiness.completedRequired, 2);
    assert.equal(readiness.totalRequired, 2);
  });

  it("refuses without a named owner", () => {
    const readiness = deriveLaunchReadiness(launch({ ownerId: null }));

    assert.equal(readiness.ready, false);
    assert.ok(readiness.blockers.some((blocker) => /owner/i.test(blocker)));
  });

  it("refuses without a verified backup", () => {
    const readiness = deriveLaunchReadiness(launch({ backupVerifiedAt: null }));

    assert.equal(readiness.ready, false);
    assert.ok(readiness.blockers.some((blocker) => /backup/i.test(blocker)));
  });

  it("refuses without a written rollback plan", () => {
    assert.equal(deriveLaunchReadiness(launch({ rollbackPlan: null })).ready, false);
    // Whitespace is not a plan.
    assert.equal(deriveLaunchReadiness(launch({ rollbackPlan: "   " })).ready, false);
  });

  it("refuses while the launch is frozen", () => {
    const readiness = deriveLaunchReadiness(launch({ isFrozen: true }));

    assert.equal(readiness.ready, false);
    assert.ok(readiness.blockers.some((blocker) => /frozen/i.test(blocker)));
  });

  it("refuses while a required checklist item is outstanding", () => {
    const readiness = deriveLaunchReadiness(
      launch({
        checklistItems: [
          { label: "Backup verified", isRequired: true, status: "COMPLETE" },
          { label: "Tracking firing", isRequired: true, status: "PENDING" },
        ],
      }),
    );

    assert.equal(readiness.ready, false);
    assert.ok(readiness.blockers.some((blocker) => /Tracking firing/.test(blocker)));
  });

  it("calls out a failed item separately from an unfinished one", () => {
    const readiness = deriveLaunchReadiness(
      launch({
        checklistItems: [
          { label: "Payment flow", isRequired: true, status: "FAILED" },
          { label: "SMS sending", isRequired: true, status: "PENDING" },
        ],
      }),
    );

    assert.ok(readiness.blockers.some((blocker) => /failed.*Payment flow/i.test(blocker)));
    assert.ok(readiness.blockers.some((blocker) => /outstanding.*SMS sending/i.test(blocker)));
  });

  it("ignores an item deliberately marked not applicable", () => {
    // Marking something not applicable is a decision, not an omission.
    const readiness = deriveLaunchReadiness(
      launch({
        checklistItems: [
          { label: "Backup verified", isRequired: true, status: "COMPLETE" },
          { label: "SMS sending", isRequired: true, status: "NOT_APPLICABLE" },
        ],
      }),
    );

    assert.equal(readiness.ready, true);
    assert.equal(readiness.totalRequired, 1);
  });

  it("ignores optional items entirely", () => {
    const readiness = deriveLaunchReadiness(
      launch({
        checklistItems: [
          { label: "Backup verified", isRequired: true, status: "COMPLETE" },
          { label: "Nice to have", isRequired: false, status: "PENDING" },
        ],
      }),
    );

    assert.equal(readiness.ready, true);
  });

  it("reports every blocker at once rather than one at a time", () => {
    const readiness = deriveLaunchReadiness(
      launch({
        ownerId: null,
        backupVerifiedAt: null,
        rollbackPlan: null,
        checklistItems: [{ label: "Forms tested", isRequired: true, status: "PENDING" }],
      }),
    );

    assert.equal(readiness.blockers.length, 4);
  });

  it("is ready with no checklist at all, provided the three essentials hold", () => {
    const readiness = deriveLaunchReadiness(launch({ checklistItems: [] }));

    assert.equal(readiness.ready, true);
    assert.equal(readiness.totalRequired, 0);
  });
});
