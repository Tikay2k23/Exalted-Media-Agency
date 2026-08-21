import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JOURNEY_STAGES } from "@/lib/journey/phases";
import type { JourneyAccount } from "@/lib/journey/journey-board";
import {
  STAGE_FOCUS,
  type ClientTabKey,
  stageFocusFor,
  stageFocusHref,
  stageSignals,
} from "@/lib/journey/stage-focus";

/**
 * What the journey page says each stage is for.
 *
 * The rule this protects is the one that matters on this page: a link that
 * goes nowhere is worse than no link. These tests fail if a stage is added
 * without focus content, or if a link is pointed at a tab the client record
 * does not have.
 */

/** The client record's real tabs, copied from TAB_KEYS on that page. */
const REAL_TABS: ClientTabKey[] = [
  "overview",
  "contacts",
  "services",
  "tasks",
  "journey",
  "quality",
  "reports",
  "files",
  "activity",
  "integrations",
];

describe("stage focus", () => {
  it("covers every stage in the progression", () => {
    for (const stage of JOURNEY_STAGES) {
      assert.ok(
        STAGE_FOCUS[stage.key],
        `${stage.key} has no focus content, so its card would be empty`,
      );
    }
  });

  it("never points at a tab that does not exist", () => {
    for (const stage of JOURNEY_STAGES) {
      for (const link of stageFocusFor(stage.key).links) {
        assert.ok(
          REAL_TABS.includes(link.tab),
          `${stage.key} links to "${link.tab}", which is not a tab on the client record`,
        );
      }
    }
  });

  it("gives every stage something to look at and somewhere to go", () => {
    for (const stage of JOURNEY_STAGES) {
      const focus = stageFocusFor(stage.key);

      assert.ok(focus.purpose.length > 20, `${stage.key} has no real purpose line`);
      assert.ok(focus.watchFor.length >= 3, `${stage.key} lists too little to watch`);
      assert.ok(focus.links.length >= 1, `${stage.key} offers nowhere to act`);
    }
  });

  it("builds a link to the client record, not to a journey copy of it", () => {
    const link = stageFocusFor("access_assets").links[0];

    assert.equal(stageFocusHref(link, "abc123"), "/clients/abc123?tab=files");
  });

  it("says something different for each stage", () => {
    const purposes = JOURNEY_STAGES.map((stage) => stageFocusFor(stage.key).purpose);

    assert.equal(
      new Set(purposes).size,
      purposes.length,
      "two stages share a purpose line, so the card is not stage-specific",
    );
  });
});

/**
 * The numbers each stage puts on the card.
 *
 * These come from the same account the stage gate reads, so the thing worth
 * protecting is that they stay honest: no invented figures, and no row of
 * zeroes dressed up as information on a stage with nothing to report.
 */
function account(overrides: Partial<JourneyAccount> = {}): JourneyAccount {
  return {
    projectManagerName: null,
    intakeStatus: null,
    strategyBriefStatus: null,
    criticalAccessMissing: 0,
    openDefectCount: 0,
    awaitingReviewCount: 0,
    reviewTaskCount: 0,
    openTaskCount: 0,
    overdueTaskCount: 0,
    blockedTaskCount: 0,
    launchDate: null,
    renewalDate: null,
    satisfactionScore: null,
    ...overrides,
  } as JourneyAccount;
}

describe("stage signals", () => {
  it("names the missing project manager rather than staying quiet", () => {
    const [first] = stageSignals("payment_received", account());

    assert.equal(first.value, "Not assigned");
    assert.equal(first.tone, "bad", "an unassigned account should not read as fine");
  });

  it("turns green once the manager is there", () => {
    const [first] = stageSignals(
      "payment_received",
      account({ projectManagerName: "Mark Angelo Yakit" }),
    );

    assert.equal(first.value, "Mark Angelo Yakit");
    assert.equal(first.tone, "good");
  });

  it("counts missing access, and says None when there is none", () => {
    assert.equal(
      stageSignals("access_assets", account({ criticalAccessMissing: 2 }))[0].value,
      "2 platforms",
    );
    assert.equal(
      stageSignals("access_assets", account())[0].value,
      "None",
    );
  });

  it("reads a single item as singular", () => {
    assert.equal(
      stageSignals("access_assets", account({ criticalAccessMissing: 1 }))[0].value,
      "1 platform",
    );
  });

  it("treats an unsent intake form differently from a submitted one", () => {
    assert.equal(stageSignals("onboarding", account())[0].tone, "bad");
    assert.equal(
      stageSignals("onboarding", account({ intakeStatus: "SUBMITTED" }))[0].tone,
      "good",
    );
    assert.equal(
      stageSignals("onboarding", account({ intakeStatus: "IN_PROGRESS" }))[0].tone,
      "warn",
    );
  });

  it("says nothing about work that does not exist", () => {
    const quiet = stageSignals("build_implementation", account());

    assert.equal(quiet.length, 0, "a stage with no work should show no numbers");
  });

  it("reports overdue and blocked work separately", () => {
    const busy = stageSignals(
      "build_implementation",
      account({ openTaskCount: 5, overdueTaskCount: 2, blockedTaskCount: 1 }),
    );

    assert.deepEqual(
      busy.map((signal) => [signal.label, signal.value, signal.tone]),
      [
        ["Open work", "5 tasks", "neutral"],
        ["Overdue", "2 tasks", "bad"],
        ["Blocked", "1 task", "warn"],
      ],
    );
  });

  it("gives every stage a shape it can render", () => {
    for (const stage of JOURNEY_STAGES) {
      const signals = stageSignals(stage.key, account());

      for (const signal of signals) {
        assert.ok(signal.label.length > 0, `${stage.key} produced a label-less signal`);
        assert.ok(signal.value.length > 0, `${stage.key} produced an empty value`);
      }
    }
  });
});
