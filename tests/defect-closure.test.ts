import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import {
  type ClosableDefect,
  evaluateDefectClosure,
} from "@/lib/quality/defect-closure";

const BUILDER_ID = "builder-1";
const REVIEWER_ID = "reviewer-1";

function defect(overrides: Partial<ClosableDefect> = {}): ClosableDefect {
  return {
    reference: "DEF-000101",
    status: "READY_FOR_RETEST",
    severity: "HIGH",
    assignedToId: BUILDER_ID,
    raisedById: REVIEWER_ID,
    ...overrides,
  };
}

const builder = {
  id: BUILDER_ID,
  role: Role.TEAM_MEMBER,
  teamRole: TeamRole.CREATIVE_SPECIALIST,
};

/** The project manager seat carries defect-closing authority. */
const qaReviewer = {
  id: REVIEWER_ID,
  role: Role.TEAM_MEMBER,
  teamRole: TeamRole.PROJECT_MANAGER,
};

const operationsManager = {
  id: "ops-1",
  role: Role.TEAM_MEMBER,
  teamRole: TeamRole.PROJECT_MANAGER,
};

describe("defect closure authority", () => {
  it("lets a QA reviewer close a defect somebody else worked on", () => {
    const decision = evaluateDefectClosure({ actor: qaReviewer, defect: defect() });

    assert.equal(decision.allowed, true);
    if (!decision.allowed) return;
    assert.equal(decision.requiresOverrideRecord, false);
  });

  it("refuses a builder without QA closing authority at all", () => {
    // A specialist has qa.view but not qa.closeDefect.
    const decision = evaluateDefectClosure({
      actor: builder,
      defect: defect({ assignedToId: "someone-else" }),
    });

    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "NO_PERMISSION");
  });

  it("stops a QA reviewer closing a defect assigned to themselves without a reason", () => {
    // This is the core SOP rule: no silent self-verification.
    const decision = evaluateDefectClosure({
      actor: qaReviewer,
      defect: defect({ assignedToId: REVIEWER_ID }),
    });

    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "OVERRIDE_REASON_REQUIRED");
  });

  it("allows self-closure only with a substantive recorded reason", () => {
    const tooShort = evaluateDefectClosure({
      actor: qaReviewer,
      defect: defect({ assignedToId: REVIEWER_ID }),
      overrideReason: "ok",
    });
    assert.equal(tooShort.allowed, false);

    const withReason = evaluateDefectClosure({
      actor: qaReviewer,
      defect: defect({ assignedToId: REVIEWER_ID }),
      overrideReason: "Sole reviewer available before launch; retested twice against the plan.",
    });

    assert.equal(withReason.allowed, true);
    if (!withReason.allowed) return;
    // The caller must persist the reason against the defect.
    assert.equal(withReason.requiresOverrideRecord, true);
  });

  it("does not let whitespace pass as an override reason", () => {
    const decision = evaluateDefectClosure({
      actor: qaReviewer,
      defect: defect({ assignedToId: REVIEWER_ID }),
      overrideReason: "              ",
    });

    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "OVERRIDE_REASON_REQUIRED");
  });

  it("holds the project manager to the same self-verification rule", () => {
    const decision = evaluateDefectClosure({
      actor: operationsManager,
      defect: defect({ assignedToId: operationsManager.id }),
    });

    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "OVERRIDE_REASON_REQUIRED");
  });

  it("treats an unassigned defect as nobody's own work", () => {
    const decision = evaluateDefectClosure({
      actor: qaReviewer,
      defect: defect({ assignedToId: null }),
    });

    assert.equal(decision.allowed, true);
  });

  it("refuses to close a defect that is already closed", () => {
    for (const status of ["CLOSED", "PASSED", "WONT_FIX"] as const) {
      const decision = evaluateDefectClosure({
        actor: qaReviewer,
        defect: defect({ status, assignedToId: "someone-else" }),
      });

      assert.equal(decision.allowed, false);
      if (decision.allowed) return;
      assert.equal(decision.code, "ALREADY_CLOSED");
    }
  });

  it("checks closure permission before self-verification, not after", () => {
    // A builder closing their own defect should be told they lack permission
    // rather than being invited to write an override reason.
    const decision = evaluateDefectClosure({
      actor: builder,
      defect: defect({ assignedToId: BUILDER_ID }),
      overrideReason: "I have retested this myself and it works fine now.",
    });

    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(decision.code, "NO_PERMISSION");
  });
});
