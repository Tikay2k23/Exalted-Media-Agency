import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { JourneyFlag } from "@/lib/journey/client-detail";
import type { JourneyRequirement } from "@/lib/journey/journey-board";
import { type HealthInput, journeyHealth } from "@/lib/journey/journey-health";

const NOW = new Date("2026-08-18T12:00:00.000Z");

function days(offset: number) {
  const date = new Date(NOW);

  date.setDate(date.getDate() + offset);

  return date.toISOString();
}

function requirement(overrides: Partial<JourneyRequirement> = {}): JourneyRequirement {
  return {
    key: "meta-access",
    label: "Meta Business Manager access",
    owner: "CLIENT",
    isBlocking: true,
    satisfied: true,
    reason: null,
    ...overrides,
  } as JourneyRequirement;
}

function flag(kind: JourneyFlag["kind"]): JourneyFlag {
  return { kind } as JourneyFlag;
}

function input(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    requirements: [requirement()],
    flags: [],
    tasks: [],
    dayInStage: 2,
    targetDays: 5,
    waitingDays: null,
    now: NOW,
    ...overrides,
  };
}

/**
 * The score has to be explainable.
 *
 * A number nobody can take apart is decoration, and the whole reason this
 * exists is that "63" on its own tells a project manager nothing about what to
 * do next.
 */
describe("journey health", () => {
  it("scores a clean account full marks", () => {
    const health = journeyHealth(input());

    assert.equal(health.score, 100);
    assert.equal(health.status, "ON_TRACK");
  });

  it("always says why, never just what", () => {
    const health = journeyHealth(input());

    assert.ok(health.reasons.length > 0, "a score with no reasons is decoration");
    for (const reason of health.reasons) assert.ok(reason.text.length > 5);
  });

  it("names every factor it counted, with what it counted", () => {
    const health = journeyHealth(
      input({
        requirements: [requirement(), requirement({ key: "domain", satisfied: false })],
        tasks: [{ status: "IN_PROGRESS", dueDate: days(3), priority: "MEDIUM" }],
      }),
    );

    const keys = health.factors.map((factor) => factor.key);

    assert.ok(keys.includes("stageTiming"));
    assert.ok(keys.includes("requirements"));
    assert.ok(keys.includes("workDelivery"));

    for (const factor of health.factors) {
      assert.ok(factor.detail.length > 5, `${factor.key} explains nothing`);
      assert.ok(factor.weight > 0);
    }
  });
});

/**
 * Factors that do not apply are left out rather than scored zero.
 *
 * An account with no milestone is not an account with a failing milestone, and
 * an account nobody is waiting on should not be marked down for a
 * responsiveness that was never tested.
 */
describe("what gets counted", () => {
  it("does not score client responsiveness when nobody is waiting", () => {
    const health = journeyHealth(input());

    assert.equal(
      health.factors.some((factor) => factor.key === "clientResponsiveness"),
      false,
    );
  });

  it("scores it once the agency is actually waiting", () => {
    const health = journeyHealth({
      ...input(),
      flags: [flag("WAITING_ON_CLIENT")],
      waitingDays: 3,
    });

    const factor = health.factors.find((entry) => entry.key === "clientResponsiveness");

    assert.ok(factor);
    assert.match(factor.detail, /3 days/);
    assert.ok(factor.score < 100);
  });

  it("skips stage timing when the stage has no target", () => {
    const health = journeyHealth(input({ targetDays: null }));

    assert.equal(health.factors.some((factor) => factor.key === "stageTiming"), false);
  });

  it("skips work delivery when there is no open work", () => {
    const health = journeyHealth(input({ tasks: [] }));

    assert.equal(health.factors.some((factor) => factor.key === "workDelivery"), false);
  });

  it("does not punish an account for having nothing measurable", () => {
    const health = journeyHealth(
      input({ requirements: [], targetDays: null, tasks: [], flags: [] }),
    );

    assert.equal(health.score, 100);
  });
});

describe("status", () => {
  it("reads blocked whenever a blocker is open, whatever the score", () => {
    const health = journeyHealth({ ...input(), flags: [flag("BLOCKED")] });

    assert.equal(health.status, "BLOCKED");
  });

  it("reads waiting when the client owes us something and nothing is wrong", () => {
    const health = journeyHealth({
      ...input(),
      flags: [flag("WAITING_ON_CLIENT")],
      waitingDays: 1,
    });

    assert.equal(health.status, "WAITING");
  });

  it("reads at risk once the stage is over its target, even scoring well", () => {
    const health = journeyHealth(input({ dayInStage: 9, targetDays: 5 }));

    assert.equal(health.status, "AT_RISK");
  });

  it("degrades stage timing gradually rather than off a cliff", () => {
    const oneDayOver = journeyHealth(input({ dayInStage: 6, targetDays: 5 }));
    const wayOver = journeyHealth(input({ dayInStage: 20, targetDays: 5 }));

    assert.ok(oneDayOver.score > wayOver.score, "one day late should not score like three weeks");
    assert.ok(oneDayOver.score > 80, "a single day over is not a crisis");
  });
});

describe("work delivery", () => {
  it("counts an overdue task against the score", () => {
    const clean = journeyHealth(
      input({ tasks: [{ status: "IN_PROGRESS", dueDate: days(2), priority: "MEDIUM" }] }),
    );
    const late = journeyHealth(
      input({ tasks: [{ status: "IN_PROGRESS", dueDate: days(-2), priority: "MEDIUM" }] }),
    );

    assert.ok(late.score < clean.score);
  });

  it("counts an overdue important task harder than an ordinary one", () => {
    const ordinary = journeyHealth(
      input({ tasks: [{ status: "IN_PROGRESS", dueDate: days(-2), priority: "LOW" }] }),
    );
    const important = journeyHealth(
      input({ tasks: [{ status: "IN_PROGRESS", dueDate: days(-2), priority: "HIGH" }] }),
    );

    assert.ok(important.score < ordinary.score);
  });

  it("ignores finished work when judging delivery", () => {
    const health = journeyHealth(
      input({ tasks: [{ status: "DONE", dueDate: days(-30), priority: "HIGH" }] }),
    );

    assert.equal(health.factors.some((factor) => factor.key === "workDelivery"), false);
    assert.equal(health.score, 100);
  });
});

describe("requirements", () => {
  it("scores only what actually blocks the stage", () => {
    const health = journeyHealth(
      input({
        requirements: [
          requirement({ satisfied: true }),
          requirement({ key: "nice-to-have", isBlocking: false, satisfied: false }),
        ],
      }),
    );

    const factor = health.factors.find((entry) => entry.key === "requirements");

    // The recommended one is unmet and deliberately does not drag the score.
    assert.equal(factor?.score, 100);
    assert.match(factor?.detail ?? "", /1 of 1/);
  });

  it("falls as blocking items go unmet", () => {
    const health = journeyHealth(
      input({
        requirements: [
          requirement({ satisfied: true }),
          requirement({ key: "domain", satisfied: false }),
        ],
      }),
    );

    assert.equal(health.factors.find((entry) => entry.key === "requirements")?.score, 50);
  });
});
