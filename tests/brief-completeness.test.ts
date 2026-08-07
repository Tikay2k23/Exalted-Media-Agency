import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REQUIRED_BRIEF_FIELDS,
  deriveBriefCompleteness,
} from "@/lib/strategy/brief-service";

function complete(overrides: Record<string, unknown> = {}) {
  const brief: Record<string, unknown> = {};

  for (const field of REQUIRED_BRIEF_FIELDS) {
    brief[field.key] = `An answer for ${field.label}.`;
  }

  return { ...brief, ...overrides };
}

describe("strategy brief completeness", () => {
  it("treats a missing brief as entirely unanswered", () => {
    const result = deriveBriefCompleteness(null);

    assert.equal(result.complete, false);
    assert.equal(result.answered, 0);
    assert.equal(result.missing.length, REQUIRED_BRIEF_FIELDS.length);
  });

  it("is complete when every required question is answered", () => {
    const result = deriveBriefCompleteness(complete());

    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
    assert.equal(result.answered, result.total);
  });

  it("names the questions that are still unanswered", () => {
    const result = deriveBriefCompleteness(
      complete({ successMetrics: null, targetAudience: null }),
    );

    assert.equal(result.complete, false);
    assert.equal(result.missing.length, 2);
    assert.ok(result.missing.some((item) => /success/i.test(item)));
    assert.ok(result.missing.some((item) => /audience/i.test(item)));
  });

  it("does not accept whitespace as an answer", () => {
    // A box containing a space is not a plan.
    const result = deriveBriefCompleteness(complete({ primaryGoal: "   \n\t " }));

    assert.equal(result.complete, false);
    assert.ok(result.missing.some((item) => /goal/i.test(item)));
  });

  it("does not accept an empty string as an answer", () => {
    assert.equal(deriveBriefCompleteness(complete({ mainOffer: "" })).complete, false);
  });

  it("ignores the optional questions entirely", () => {
    // Funnel strategy and the rest are useful, but they do not gate production.
    const result = deriveBriefCompleteness(
      complete({ funnelStrategy: null, risks: null, timelineSummary: "" }),
    );

    assert.equal(result.complete, true);
  });

  it("counts answers rather than reporting a bare true or false", () => {
    const result = deriveBriefCompleteness(complete({ primaryGoal: null }));

    assert.equal(result.answered, REQUIRED_BRIEF_FIELDS.length - 1);
    assert.equal(result.total, REQUIRED_BRIEF_FIELDS.length);
  });

  it("keeps the required set small enough to be filled in one sitting", () => {
    // A brief nobody finishes gates production forever, so this is deliberately
    // the shortest set a specialist genuinely cannot start without.
    assert.ok(REQUIRED_BRIEF_FIELDS.length <= 8);
    assert.ok(REQUIRED_BRIEF_FIELDS.length >= 4);
  });
});
