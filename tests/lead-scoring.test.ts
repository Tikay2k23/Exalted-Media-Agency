import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LeadSource } from "@prisma/client";

import { type ScorableLead, scoreLead } from "@/lib/sales/lead-scoring";

function lead(overrides: Partial<ScorableLead> = {}): ScorableLead {
  return {
    budgetAmount: null,
    timeline: null,
    isDecisionMaker: null,
    mainProblem: null,
    goal: null,
    source: LeadSource.WEBSITE_FORM,
    email: null,
    phone: null,
    ...overrides,
  };
}

function pointsFor(result: ReturnType<typeof scoreLead>, label: string) {
  const contribution = result.contributions.find((item) => item.label === label);
  assert.ok(contribution, `no contribution named ${label}`);
  return contribution.points;
}

describe("lead scoring", () => {
  it("scores an empty lead low but never negative", () => {
    const result = scoreLead(lead());

    assert.ok(result.total >= 0);
    assert.equal(result.band, "COLD");
  });

  it("scores a fully qualified lead as hot", () => {
    const result = scoreLead(
      lead({
        budgetAmount: 12_000,
        timeline: "ASAP",
        isDecisionMaker: true,
        mainProblem: "Lead volume has collapsed since their agency left.",
        goal: "Thirty qualified appointments a month.",
        source: LeadSource.REFERRAL,
        email: "owner@example.com",
        phone: "+1 555 0100",
      }),
    );

    assert.equal(result.total, 100);
    assert.equal(result.band, "HOT");
  });

  it("never exceeds 100", () => {
    const result = scoreLead(
      lead({
        budgetAmount: 10_000_000,
        timeline: "urgent immediate asap this week",
        isDecisionMaker: true,
        mainProblem: "x".repeat(500),
        goal: "y".repeat(500),
        source: LeadSource.REPEAT_CLIENT,
        email: "a@b.com",
        phone: "123",
      }),
    );

    assert.equal(result.total, 100);
  });

  it("weights budget in descending tiers", () => {
    const tiers = [12_000, 6_000, 3_000, 1_500, 500, 0];
    const points = tiers.map((budgetAmount) =>
      pointsFor(scoreLead(lead({ budgetAmount })), "Budget"),
    );

    // Each tier must be worth strictly less than the one above it.
    for (let index = 1; index < points.length; index += 1) {
      assert.ok(
        points[index] < points[index - 1],
        `budget ${tiers[index]} should score below ${tiers[index - 1]}`,
      );
    }
  });

  it("treats a zero budget as no budget rather than a low one", () => {
    assert.equal(pointsFor(scoreLead(lead({ budgetAmount: 0 })), "Budget"), 0);
  });

  it("rewards reaching the decision maker and does not penalise the unknown case twice", () => {
    const yes = pointsFor(scoreLead(lead({ isDecisionMaker: true })), "Decision maker");
    const no = pointsFor(scoreLead(lead({ isDecisionMaker: false })), "Decision maker");
    const unknown = pointsFor(scoreLead(lead({ isDecisionMaker: null })), "Decision maker");

    assert.ok(yes > no);
    assert.equal(no, unknown);
  });

  it("distinguishes urgent, near-term, and vague timelines", () => {
    const urgent = pointsFor(scoreLead(lead({ timeline: "ASAP" })), "Timeline");
    const near = pointsFor(scoreLead(lead({ timeline: "next quarter" })), "Timeline");
    const vague = pointsFor(scoreLead(lead({ timeline: "sometime" })), "Timeline");
    const none = pointsFor(scoreLead(lead({ timeline: null })), "Timeline");

    assert.ok(urgent > near);
    assert.ok(near > vague);
    assert.ok(vague > none);
  });

  it("ranks referrals and repeat clients above cold outbound", () => {
    const referral = pointsFor(scoreLead(lead({ source: LeadSource.REFERRAL })), "Source");
    const repeat = pointsFor(scoreLead(lead({ source: LeadSource.REPEAT_CLIENT })), "Source");
    const outbound = pointsFor(scoreLead(lead({ source: LeadSource.OUTBOUND })), "Source");

    assert.ok(referral > outbound);
    assert.ok(repeat > outbound);
  });

  it("credits discovery only for what was actually captured", () => {
    const neither = pointsFor(scoreLead(lead()), "Discovery");
    const problemOnly = pointsFor(scoreLead(lead({ mainProblem: "No leads" })), "Discovery");
    const both = pointsFor(
      scoreLead(lead({ mainProblem: "No leads", goal: "30 appointments" })),
      "Discovery",
    );

    assert.equal(neither, 0);
    assert.ok(problemOnly > neither);
    assert.ok(both > problemOnly);
  });

  it("does not count whitespace as captured discovery", () => {
    const result = scoreLead(lead({ mainProblem: "   ", goal: "\n\t" }));
    assert.equal(pointsFor(result, "Discovery"), 0);
  });

  it("rewards being contactable at all", () => {
    const none = pointsFor(scoreLead(lead()), "Contactable");
    const emailOnly = pointsFor(scoreLead(lead({ email: "a@b.com" })), "Contactable");
    const both = pointsFor(
      scoreLead(lead({ email: "a@b.com", phone: "555" })),
      "Contactable",
    );

    assert.equal(none, 0);
    assert.ok(both > emailOnly);
    assert.ok(emailOnly > none);
  });

  it("bands scores consistently with the totals", () => {
    for (const testLead of [
      lead(),
      lead({ budgetAmount: 3_000 }),
      lead({ budgetAmount: 12_000, isDecisionMaker: true, timeline: "ASAP" }),
      lead({ budgetAmount: 12_000, isDecisionMaker: true, source: LeadSource.REFERRAL }),
    ]) {
      const result = scoreLead(testLead);
      const expected =
        result.total >= 70
          ? "HOT"
          : result.total >= 50
            ? "WARM"
            : result.total >= 30
              ? "COOL"
              : "COLD";

      assert.equal(result.band, expected, `band wrong for total ${result.total}`);
    }
  });

  it("explains every contribution so a rep can see why a lead scored what it did", () => {
    const result = scoreLead(lead({ budgetAmount: 6_000 }));

    assert.ok(result.contributions.length >= 6);

    for (const contribution of result.contributions) {
      assert.ok(contribution.reason.length > 0, `${contribution.label} has no reason`);
      assert.ok(
        contribution.points <= contribution.maxPoints,
        `${contribution.label} exceeded its maximum`,
      );
    }
  });

  it("keeps the declared maximums summing to 100", () => {
    const result = scoreLead(lead());
    const max = result.contributions.reduce((sum, item) => sum + item.maxPoints, 0);

    assert.equal(max, 100);
  });
});
