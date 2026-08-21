import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JOURNEY_STAGES } from "@/lib/journey/phases";
import {
  STAGE_FOCUS,
  type ClientTabKey,
  stageFocusFor,
  stageFocusHref,
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
