import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOpenTask } from "@/lib/journey/stage-requirements";
import {
  ALL_STATUSES,
  CATEGORY_GUIDES,
  OPEN_STATUSES,
  PLATFORM_OPTIONS,
  RECURRENCE_OPTIONS,
  STARTING_STATUSES,
  categoryGuide,
  suggestedSpecialist,
} from "@/lib/tasks/task-catalogue";

describe("the categories somebody can assign", () => {
  it("offers all eighteen marketing categories", () => {
    assert.equal(CATEGORY_GUIDES.length, 18);
  });

  it("never offers a lifecycle category", () => {
    // Stage automation creates these and five gates match on them by name.
    // Hand-making one would let a person fabricate something a gate reads as
    // process.
    const offered = new Set(CATEGORY_GUIDES.map((guide) => guide.value));

    for (const lifecycle of [
      "ONBOARDING",
      "STRATEGY",
      "QUALITY_ASSURANCE",
      "REVISION",
      "LAUNCH",
      "CLIENT_TRAINING",
      "RENEWAL",
      "OFFBOARDING",
      "AUDIT",
    ] as const) {
      assert.ok(!offered.has(lifecycle), `${lifecycle} should not be assignable by hand`);
    }
  });

  it("gives every category a description, a specialist and deliverables", () => {
    for (const guide of CATEGORY_GUIDES) {
      assert.ok(guide.description.length > 10, `${guide.value} has no real description`);
      assert.ok(guide.specialist, `${guide.value} has no specialist`);
      assert.ok(
        guide.deliverables.length >= 3 && guide.deliverables.length <= 5,
        `${guide.value} has ${guide.deliverables.length} deliverables, wanted three to five`,
      );
    }
  });

  it("points every category at SOPs that could exist", () => {
    // The panel only renders the ones actually in the library, but a reference
    // to SOP-99 would be a typo nobody notices.
    for (const guide of CATEGORY_GUIDES) {
      for (const reference of guide.sopReferences) {
        assert.match(reference, /^SOP-(0[1-9]|10)$/, `${guide.value} points at ${reference}`);
      }
    }
  });

  it("lists no category twice", () => {
    const values = CATEGORY_GUIDES.map((guide) => guide.value);
    assert.equal(new Set(values).size, values.length);
  });
});

describe("who the form suggests", () => {
  it("sends performance work to the ads seat", () => {
    for (const category of ["PAID_MEDIA", "ANALYTICS_AND_TRACKING", "CLIENT_REPORTING"] as const) {
      assert.equal(suggestedSpecialist(category), "ADS_SPECIALIST", category);
    }
  });

  it("sends CRM, integrations and messaging to the automation seat", () => {
    for (const category of [
      "CRM_AND_AUTOMATION",
      "INTEGRATIONS",
      "EMAIL_AND_SMS_MARKETING",
    ] as const) {
      assert.equal(suggestedSpecialist(category), "AUTOMATION_SPECIALIST", category);
    }
  });

  it("sends anything built or written to the creative seat", () => {
    for (const category of [
      "FUNNELS_AND_LANDING_PAGES",
      "WEBSITE_UPDATES",
      "COPYWRITING",
      "CONTENT_PLANNING",
      "CREATIVE_DESIGN",
      "VIDEO_PRODUCTION",
      "SEO",
    ] as const) {
      assert.equal(suggestedSpecialist(category), "CREATIVE_SPECIALIST", category);
    }
  });

  it("sends outreach to sales and the rest to the project manager", () => {
    assert.equal(suggestedSpecialist("LEAD_GENERATION_AND_OUTREACH"), "SALES_REP");
    assert.equal(suggestedSpecialist("CLIENT_MANAGEMENT"), "PROJECT_MANAGER");
    assert.equal(suggestedSpecialist("INTERNAL_OPERATIONS"), "PROJECT_MANAGER");
  });

  it("suggests nobody for a lifecycle category", () => {
    // Nothing in the form can select one, but the panel must not invent a
    // recommendation for a task automation created.
    assert.equal(suggestedSpecialist("ONBOARDING"), null);
    assert.equal(categoryGuide("LAUNCH"), null);
    assert.equal(categoryGuide(null), null);
  });
});

describe("statuses", () => {
  it("offers the nine starting statuses", () => {
    assert.deepEqual(
      STARTING_STATUSES.map((status) => status.value),
      [
        "BACKLOG",
        "TODO",
        "IN_PROGRESS",
        "WAITING_CLIENT",
        "BLOCKED",
        "NEEDS_REVIEW",
        "REVISION_REQUIRED",
        "APPROVED",
        "DONE",
      ],
    );
  });

  it("never offers cancelled as a starting status", () => {
    // Nothing is created cancelled; offering it would only ever be a misclick.
    assert.ok(STARTING_STATUSES.every((status) => status.value !== "CANCELLED"));
    assert.ok(ALL_STATUSES.some((status) => status.value === "CANCELLED"));
  });

  it("agrees with the stage gates about what is still open", () => {
    // The gates and the dropdowns read the same list. If these ever disagreed,
    // a gate would hold an account for work the board shows as finished.
    for (const status of ALL_STATUSES) {
      assert.equal(
        isOpenTask(status.value),
        OPEN_STATUSES.includes(status.value),
        `${status.value} disagrees between the catalogue and the gates`,
      );
    }
  });

  it("treats approved and done as finished", () => {
    assert.equal(isOpenTask("APPROVED"), false);
    assert.equal(isOpenTask("DONE"), false);
    assert.equal(isOpenTask("CANCELLED"), false);
  });

  it("treats everything else as still open", () => {
    assert.equal(isOpenTask("BACKLOG"), true);
    assert.equal(isOpenTask("REVISION_REQUIRED"), true);
    assert.equal(isOpenTask("NEEDS_REVIEW"), true);
  });
});

describe("platform and recurrence options", () => {
  it("offers every platform the agency works in", () => {
    const values = PLATFORM_OPTIONS.map((option) => option.value);

    for (const expected of [
      "META_ADS",
      "GOOGLE_ADS",
      "GOHIGHLEVEL",
      "WEBSITE",
      "EMAIL",
      "SMS",
      "FACEBOOK",
      "INSTAGRAM",
      "LINKEDIN",
      "GOOGLE_BUSINESS_PROFILE",
      "YOUTUBE",
      "TIKTOK",
      "CANVA",
      "ZAPIER",
      "MAKE",
      "N8N",
      "OTHER",
    ] as const) {
      assert.ok(values.includes(expected), `${expected} is missing`);
    }
  });

  it("offers every recurrence, starting with none", () => {
    assert.equal(RECURRENCE_OPTIONS[0].value, "NONE");
    assert.equal(RECURRENCE_OPTIONS.length, 6);
  });
});
