import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_SALES_FILTERS,
  advancedFilterCount,
  applySalesFilters,
  dealValue,
  followUpLabel,
  followUpStatus,
  hasActiveFilters,
  matchesQuickFilter,
  quickFilterChips,
  resolveRange,
  salesMetrics,
  sortLeads,
  type SalesLead,
} from "@/lib/sales/sales-view";

/** A Thursday at 10am. */
const NOW = new Date(2026, 7, 13, 10, 0, 0);
const MONTH = resolveRange("month", NOW);

function lead(overrides: Partial<SalesLead> = {}): SalesLead {
  return {
    id: Math.random().toString(36).slice(2),
    contactId: "contact-1",
    contactName: "John Smith",
    businessName: "ABC Plumbing",
    opportunityName: "CRM Automation",
    email: "john@abcplumbing.com",
    phone: "555-1234",
    source: "WEBSITE_FORM",
    status: "CONTACTED",
    stageId: "stage-contacted",
    stageKey: "contacted",
    stageName: "Contacted",
    ownerId: "user-sarah",
    ownerName: "Sarah Reyes",
    nextAction: "Follow up on proposal",
    nextFollowUpAt: "2026-08-14T14:00:00",
    lastContactAt: "2026-08-12T09:00:00",
    strategyCallAt: null,
    strategyCallStatus: null,
    proposalSentAt: null,
    wonAt: null,
    wonByName: null,
    lostAt: null,
    lostReasonCode: null,
    nurtureUntil: null,
    expectedCloseAt: null,
    opportunityValue: null,
    budgetAmount: 3000,
    budgetRange: null,
    proposalValue: null,
    finalValue: null,
    convertedClientId: null,
    serviceInterest: null,
    campaign: null,
    timeline: null,
    isDecisionMaker: null,
    mainProblem: null,
    goal: null,
    currentSolution: null,
    qualificationNotes: null,
    score: null,
    tags: [],
    notes: null,
    createdAt: "2026-08-10T09:00:00",
    updatedAt: "2026-08-10T09:00:00",
    createdByName: null,
    followerNames: [],
    activity: { calls: 0, notes: 0, tasks: 0, appointments: 0, files: 0 },
    ...overrides,
  };
}

describe("the quick filter chips", () => {
  const rows = [
    lead({ id: "overdue", nextFollowUpAt: "2026-08-08T09:00:00" }),
    lead({ id: "today", nextFollowUpAt: "2026-08-13T16:00:00" }),
    lead({ id: "tomorrow", nextFollowUpAt: "2026-08-14T10:00:00" }),
    lead({ id: "later", nextFollowUpAt: "2026-08-20T10:00:00" }),
    lead({ id: "adrift", nextFollowUpAt: null, nextAction: null }),
    lead({ id: "call", strategyCallAt: "2026-08-18T15:00:00", strategyCallStatus: "BOOKED" }),
    lead({ id: "proposal", stageKey: "proposal_sent", proposalSentAt: "2026-08-11T09:00:00" }),
    lead({ id: "closed", stageKey: "won", wonAt: "2026-08-12T09:00:00" }),
  ];

  it("counts each chip with the predicate the chip filters by", () => {
    // The failure this guards against is a chip reading nine over a list of
    // eight, which is worse than showing no count at all.
    for (const chip of quickFilterChips(rows, NOW)) {
      const filtered = applySalesFilters(rows, { ...EMPTY_SALES_FILTERS, quick: chip.key }, NOW);

      assert.equal(filtered.length, chip.count, chip.key);
    }
  });

  it("puts every opportunity under All", () => {
    const chips = quickFilterChips(rows, NOW);

    assert.equal(chips.find((chip) => chip.key === "all")?.count, rows.length);
  });

  it("counts overdue separately from everything merely due", () => {
    const byKey = new Map(quickFilterChips(rows, NOW).map((chip) => [chip.key, chip.count]));

    assert.equal(byKey.get("overdue"), 1);
    // Overdue and today are both due; tomorrow and later are not yet.
    assert.equal(byKey.get("needs-follow-up"), 2);
  });

  it("counts an opportunity with no next action, whatever its follow-up looks like", () => {
    const chips = quickFilterChips(rows, NOW);

    assert.equal(chips.find((chip) => chip.key === "no-next-action")?.count, 1);
  });

  it("leaves a cancelled call out of the strategy call chip", () => {
    const cancelled = lead({
      strategyCallAt: "2026-08-18T15:00:00",
      strategyCallStatus: "CANCELLED",
    });

    assert.equal(matchesQuickFilter(cancelled, "strategy-calls", NOW), false);
  });
});

describe("when the follow-up falls", () => {
  it("buckets by calendar day rather than by elapsed hours", () => {
    assert.equal(followUpStatus(lead({ nextFollowUpAt: "2026-08-08T09:00:00" }), NOW), "overdue");
    // Nine in the morning is behind us, but it is still today.
    assert.equal(followUpStatus(lead({ nextFollowUpAt: "2026-08-13T09:00:00" }), NOW), "today");
    assert.equal(followUpStatus(lead({ nextFollowUpAt: "2026-08-14T23:00:00" }), NOW), "tomorrow");
    assert.equal(followUpStatus(lead({ nextFollowUpAt: "2026-08-20T09:00:00" }), NOW), "upcoming");
    assert.equal(followUpStatus(lead({ nextFollowUpAt: null }), NOW), "none");
  });

  it("reads a nurtured opportunity's own date rather than calling it unscheduled", () => {
    const nurtured = lead({
      stageKey: "long_term_nurture",
      status: "NURTURE",
      nextFollowUpAt: null,
      nurtureUntil: "2026-08-14T09:00:00",
    });

    assert.equal(followUpStatus(nurtured, NOW), "tomorrow");
  });

  it("agrees with the label shown beside it", () => {
    const cases: [string, string][] = [
      ["2026-08-08T09:00:00", "overdue"],
      ["2026-08-13T16:00:00", "today"],
      ["2026-08-14T10:00:00", "soon"],
    ];

    for (const [at, tone] of cases) {
      assert.equal(followUpLabel(at, NOW).tone, tone, at);
    }
  });
});

describe("the rest of the sort options", () => {
  const rows = [
    lead({ id: "cheap", opportunityValue: 1000, budgetAmount: null }),
    lead({ id: "rich", opportunityValue: 12000, budgetAmount: null }),
    lead({ id: "quoted", opportunityValue: 1000, proposalValue: 8000, budgetAmount: null }),
  ];

  it("prefers the quoted figure over the estimate when ranking by value", () => {
    // Otherwise a deal with a proposal out sorts below somebody's guess.
    assert.deepEqual(
      sortLeads(rows, "highest-value", NOW).map((row) => row.id),
      ["rich", "quoted", "cheap"],
    );

    assert.deepEqual(
      sortLeads(rows, "lowest-value", NOW).map((row) => row.id),
      ["cheap", "quoted", "rich"],
    );
  });

  it("sinks never-contacted opportunities in both contact orders", () => {
    const contactRows = [
      lead({ id: "never", lastContactAt: null }),
      lead({ id: "old", lastContactAt: "2026-07-01T09:00:00" }),
      lead({ id: "fresh", lastContactAt: "2026-08-12T09:00:00" }),
    ];

    assert.deepEqual(
      sortLeads(contactRows, "recently-contacted", NOW).map((row) => row.id),
      ["fresh", "old", "never"],
    );

    /*
     * Never contacted is unknown, not "longest ago". Sorting it as zero put it
     * permanently above a lead that is genuinely going cold, which is the one
     * this order exists to surface.
     */
    assert.deepEqual(
      sortLeads(contactRows, "least-recently-contacted", NOW).map((row) => row.id),
      ["old", "fresh", "never"],
    );
  });

  it("sorts by expected close, with no date last", () => {
    const closing = [
      lead({ id: "none", expectedCloseAt: null }),
      lead({ id: "late", expectedCloseAt: "2026-09-30T09:00:00" }),
      lead({ id: "soon", expectedCloseAt: "2026-08-20T09:00:00" }),
    ];

    assert.deepEqual(
      sortLeads(closing, "expected-close", NOW).map((row) => row.id),
      ["soon", "late", "none"],
    );
  });

  it("sorts by when the row last changed", () => {
    const touched = [
      lead({ id: "stale", updatedAt: "2026-08-01T09:00:00" }),
      lead({ id: "hot", updatedAt: "2026-08-13T09:00:00" }),
    ];

    assert.deepEqual(
      sortLeads(touched, "recently-updated", NOW).map((row) => row.id),
      ["hot", "stale"],
    );
  });
});

describe("the filters behind More Filters", () => {
  const rows = [
    lead({ id: "tagged", tags: ["Enterprise", "Referral Partner"], opportunityValue: 5000 }),
    lead({ id: "untagged", tags: [], opportunityValue: 500 }),
    lead({ id: "campaign", tags: [], campaign: "Spring Roofing", opportunityValue: 20000 }),
  ];

  it("filters by an exact tag rather than by substring", () => {
    const filtered = applySalesFilters(rows, { ...EMPTY_SALES_FILTERS, tag: "Enterprise" }, NOW);

    assert.deepEqual(filtered.map((row) => row.id), ["tagged"]);
  });

  it("filters on a value band using the same figure the card shows", () => {
    const filtered = applySalesFilters(
      rows,
      { ...EMPTY_SALES_FILTERS, minValue: "1000", maxValue: "10000" },
      NOW,
    );

    assert.deepEqual(filtered.map((row) => row.id), ["tagged"]);
  });

  it("filters by campaign without minding the case", () => {
    const filtered = applySalesFilters(
      rows,
      { ...EMPTY_SALES_FILTERS, campaign: "spring roofing" },
      NOW,
    );

    assert.deepEqual(filtered.map((row) => row.id), ["campaign"]);
  });

  it("counts only the filters that are actually set", () => {
    assert.equal(advancedFilterCount(EMPTY_SALES_FILTERS), 0);
    assert.equal(
      advancedFilterCount({ ...EMPTY_SALES_FILTERS, tag: "Enterprise", minValue: "100" }),
      2,
    );
  });

  it("treats a chosen chip as an active filter, so Clear appears", () => {
    assert.equal(hasActiveFilters(EMPTY_SALES_FILTERS), false);
    assert.equal(hasActiveFilters({ ...EMPTY_SALES_FILTERS, quick: "overdue" }), true);
  });

  it("filters by when the opportunity was created, inclusive of both days", () => {
    const created = [
      lead({ id: "early", createdAt: "2026-08-01T09:00:00" }),
      lead({ id: "middle", createdAt: "2026-08-10T09:00:00" }),
      lead({ id: "late", createdAt: "2026-08-13T23:30:00" }),
    ];

    const filtered = applySalesFilters(
      created,
      { ...EMPTY_SALES_FILTERS, createdFrom: "2026-08-10", createdTo: "2026-08-13" },
      NOW,
    );

    assert.deepEqual(filtered.map((row) => row.id).sort(), ["late", "middle"]);
  });
});

describe("what one opportunity is worth", () => {
  it("takes the most committed number, and never adds two of them", () => {
    assert.equal(dealValue(lead({ budgetAmount: 3000, opportunityValue: null })), 3000);
    assert.equal(dealValue(lead({ budgetAmount: 3000, opportunityValue: 4000 })), 4000);
    assert.equal(
      dealValue(lead({ budgetAmount: 3000, opportunityValue: 4000, proposalValue: 5000 })),
      5000,
    );
    assert.equal(
      dealValue(
        lead({
          budgetAmount: 3000,
          opportunityValue: 4000,
          proposalValue: 5000,
          finalValue: 4500,
        }),
      ),
      4500,
    );
  });

  it("agrees with the pipeline value on the metric strip", () => {
    const rows = [
      lead({ stageKey: "qualified", opportunityValue: 4000, budgetAmount: 1000 }),
      lead({ stageKey: "proposal_sent", proposalValue: 6000, budgetAmount: 1000 }),
    ];

    assert.equal(
      salesMetrics(rows, MONTH, NOW).pipelineValue,
      rows.reduce((sum, row) => sum + dealValue(row), 0),
    );
  });
});
