import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type ActivityEntry,
  activityCategory,
  activityCounts,
  filterActivity,
} from "@/lib/clients/activity-feed";

const entry = (action: string, entityType = "CLIENT"): ActivityEntry => ({
  id: action,
  action,
  entityType,
  actorName: "Aileen Romero",
  createdAt: "2026-08-29T09:00:00.000Z",
});

describe("categorising activity", () => {
  it("lets the entity type settle what it can", () => {
    assert.equal(activityCategory(entry("Anything at all", "EMPLOYEE_TASK")), "work");
    assert.equal(activityCategory(entry("Anything at all", "CONTRACT")), "billing");
    assert.equal(activityCategory(entry("Anything at all", "REPORT")), "report");
  });

  it("reads the real sentences this codebase writes", () => {
    const cases: [string, string][] = [
      ["Added a note on Cedar Ridge Landscaping", "note"],
      ["Moved Riverbend Orthodontics into Onboarding Form Sent", "journey"],
      ["Cedar Ridge Landscaping cleared Blocked: Waiting on the onboarding form", "journey"],
      ["Followed up with Cedar Ridge Landscaping on: Meta Business Manager access", "communication"],
      ["Logged call with Pinnacle Roofing Co", "communication"],
      ["Re-sent the intake form to Summit Peak Roofing", "communication"],
      ['Approved "Send welcome email and onboarding form"', "approval"],
      ["Raised a critical defect DEF-1 on Exalted Media", "approval"],
      ["Recorded a pending payment on INV-000003", "billing"],
      ["Raised invoice INV-000004 for Cedar Ridge", "billing"],
      ["Started the monthly report for Cedar Ridge Landscaping", "report"],
      ["Completed optimization: verify lifecycle - Exceeded expectation", "report"],
      ["Assessed Cedar Ridge Landscaping as yellow", "report"],
      ["Updated the A2P registration information for Riverbend Orthodontics", "integration"],
      ["Created client Summit Peak Roofing and started onboarding", "system"],
      ["Converted lead Summit Peak Roofing into a client account", "system"],
    ];

    for (const [action, expected] of cases) {
      assert.equal(activityCategory(entry(action)), expected, action);
    }
  });

  it("admits when it does not know rather than guessing", () => {
    /*
     * The point of Other: a row this never anticipated is still shown, under
     * a label that does not claim to have understood it.
     */
    assert.equal(activityCategory(entry("Frobnicated the widget")), "other");
  });

  it("does not let a note be swallowed by another rule", () => {
    /* "Added a note on X" also matches nothing else, but the note wins first. */
    assert.equal(activityCategory(entry("Added a note on the invoice dispute")), "note");
  });

  it("reads an approval before it reads the thing approved", () => {
    assert.equal(activityCategory(entry("Approved the strategy brief for Exalted Media")), "approval");
  });
});

describe("filtering", () => {
  const entries = [
    entry("Added a note on Cedar Ridge Landscaping"),
    entry("Moved Cedar Ridge into Access Collection"),
    entry("Recorded a pending payment on INV-000003"),
    entry("Completed the launch checklist", "EMPLOYEE_TASK"),
  ];

  it("shows everything when nothing is asked", () => {
    assert.equal(filterActivity(entries, "all", "").length, 4);
  });

  it("narrows to one category", () => {
    assert.deepEqual(
      filterActivity(entries, "billing", "").map((e) => e.action),
      ["Recorded a pending payment on INV-000003"],
    );
  });

  it("searches the sentence and the person", () => {
    assert.equal(filterActivity(entries, "all", "INV-000003").length, 1);
    assert.equal(filterActivity(entries, "all", "aileen").length, 4);
    assert.equal(filterActivity(entries, "all", "nothing here").length, 0);
  });

  it("applies the category and the search together", () => {
    assert.equal(filterActivity(entries, "journey", "payment").length, 0);
    assert.equal(filterActivity(entries, "journey", "access").length, 1);
  });

  it("counts what is actually present", () => {
    const counts = activityCounts(entries);

    assert.equal(counts.get("note"), 1);
    assert.equal(counts.get("billing"), 1);
    assert.equal(counts.get("work"), 1);
    assert.equal(counts.get("integration"), undefined);
  });
});
