import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  columnsForRole,
  deriveSyncCandidate,
  hasFinishedBuilding,
  isLive,
  isWaitingOnClient,
} from "@/lib/workflow/workstream-board";

describe("the board every seat gets", () => {
  it("gives each seat the same columns in the same order", () => {
    // Five bespoke pipelines would be five sets of code to keep in step.
    const shape = (role: Parameters<typeof columnsForRole>[0]) =>
      columnsForRole(role).map((column) => column.stage);

    assert.deepEqual(shape("AUTOMATION_SPECIALIST"), shape("CREATIVE_SPECIALIST"));
    assert.deepEqual(shape("ADS_SPECIALIST"), shape("PROJECT_MANAGER"));
  });

  it("does not offer NOT_REQUIRED as somewhere to drag work", () => {
    // Whether a seat is needed comes from the purchased service.
    for (const role of ["AUTOMATION_SPECIALIST", "PROJECT_MANAGER"] as const) {
      assert.ok(columnsForRole(role).every((column) => column.stage !== "NOT_REQUIRED"));
    }
  });

  it("words the same column differently per seat", () => {
    const creative = columnsForRole("CREATIVE_SPECIALIST").find(
      (column) => column.stage === "SELF_REVIEW",
    );
    const automation = columnsForRole("AUTOMATION_SPECIALIST").find(
      (column) => column.stage === "SELF_REVIEW",
    );

    assert.notEqual(creative?.label, automation?.label);
    assert.match(creative?.hint ?? "", /mobile/i);
  });

  it("marks the columns where the client is the hold-up", () => {
    const waiting = columnsForRole("ADS_SPECIALIST")
      .filter((column) => column.waiting)
      .map((column) => column.stage);

    assert.deepEqual(waiting, ["WAITING_ON_ACCESS", "WAITING_ON_ASSETS"]);
  });

  it("agrees with isWaitingOnClient", () => {
    assert.equal(isWaitingOnClient("WAITING_ON_ACCESS"), true);
    assert.equal(isWaitingOnClient("WAITING_ON_ASSETS"), true);
    assert.equal(isWaitingOnClient("IN_PROGRESS"), false);
  });
});

describe("when a seat has finished building", () => {
  it("counts everything from self review onwards", () => {
    for (const stage of [
      "SELF_REVIEW",
      "INTERNAL_REVIEW",
      "QA_CORRECTIONS",
      "READY_TO_SHIP",
      "LIVE",
      "COMPLETE",
    ] as const) {
      assert.equal(hasFinishedBuilding(stage), true, stage);
    }
  });

  it("does not count work still in hand or parked", () => {
    for (const stage of [
      "ASSIGNED",
      "READY",
      "IN_PROGRESS",
      "WAITING_ON_ACCESS",
      "WAITING_ON_ASSETS",
    ] as const) {
      assert.equal(hasFinishedBuilding(stage), false, stage);
    }
  });

  it("treats corrections as finished building, because the build happened", () => {
    // QA sent it back, which means QA has it. The account is in QA either way.
    assert.equal(hasFinishedBuilding("QA_CORRECTIONS"), true);
  });

  it("counts live and complete as live", () => {
    assert.equal(isLive("LIVE"), true);
    assert.equal(isLive("COMPLETE"), true);
    assert.equal(isLive("READY_TO_SHIP"), false);
  });
});

const specialist = (stage: Parameters<typeof hasFinishedBuilding>[0]) => ({
  role: "AUTOMATION_SPECIALIST" as const,
  stage,
  isRequired: true,
});

describe("what the boards let the master journey do", () => {
  it("proposes QA once every specialist has finished building", () => {
    const candidate = deriveSyncCandidate("in_production", [
      specialist("SELF_REVIEW"),
      { role: "CREATIVE_SPECIALIST", stage: "READY_TO_SHIP", isRequired: true },
    ]);

    assert.equal(candidate?.stageKey, "internal_quality_assurance");
  });

  it("proposes nothing while one specialist is still building", () => {
    const candidate = deriveSyncCandidate("in_production", [
      specialist("SELF_REVIEW"),
      { role: "CREATIVE_SPECIALIST", stage: "IN_PROGRESS", isRequired: true },
    ]);

    assert.equal(candidate, null);
  });

  it("ignores the project manager and sales when deciding production is done", () => {
    // Their work is coordination, not building, and it never finishes on the
    // same clock as the specialists.
    const candidate = deriveSyncCandidate("in_production", [
      specialist("READY_TO_SHIP"),
      { role: "PROJECT_MANAGER", stage: "IN_PROGRESS", isRequired: true },
      { role: "SALES_REP", stage: "ASSIGNED", isRequired: true },
    ]);

    assert.equal(candidate?.stageKey, "internal_quality_assurance");
  });

  it("ignores retired workstreams", () => {
    const candidate = deriveSyncCandidate("in_production", [
      specialist("READY_TO_SHIP"),
      { role: "ADS_SPECIALIST", stage: "NOT_REQUIRED", isRequired: false },
    ]);

    assert.equal(candidate?.stageKey, "internal_quality_assurance");
  });

  it("proposes live only from ready for launch", () => {
    assert.equal(
      deriveSyncCandidate("ready_for_launch", [specialist("LIVE")])?.stageKey,
      "live_active",
    );

    // The same set of workstreams means nothing from a different stage: a
    // client in QA does not jump to live because a specialist ticked live.
    assert.equal(deriveSyncCandidate("client_review", [specialist("LIVE")]), null);
  });

  it("proposes nothing for an account with no specialist work", () => {
    assert.equal(
      deriveSyncCandidate("in_production", [
        { role: "PROJECT_MANAGER", stage: "COMPLETE", isRequired: true },
      ]),
      null,
    );
  });

  it("proposes nothing from a stage it has no rule for", () => {
    assert.equal(deriveSyncCandidate("onboarding_complete", [specialist("COMPLETE")]), null);
    assert.equal(deriveSyncCandidate(null, [specialist("COMPLETE")]), null);
  });
});
