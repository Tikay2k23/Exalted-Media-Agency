import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PROPOSAL_AGING_DAYS,
  EMPTY_SALES_FILTERS,
  applySalesFilters,
  followUpLabel,
  followUpQueue,
  hasNoNextAction,
  hasNoNextFollowUp,
  isCallOn,
  isFollowUpDue,
  isFollowUpOverdue,
  isNeverContacted,
  isOpen,
  isProposalAging,
  lastContactLabel,
  matchesAction,
  needsAction,
  pipelineCounts,
  proposalAgeDays,
  recentWins,
  repPerformance,
  resolveRange,
  salesMetrics,
  sortLeads,
  sourcePerformance,
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
    budgetRange: null,
    budgetAmount: 3000,
    proposalValue: null,
    finalValue: null,
    convertedClientId: null,
    handoffState: null,
    handoffClientId: null,
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

describe("what counts as open", () => {
  it("treats won, lost and abandoned as closed", () => {
    for (const stageKey of ["won", "lost", "abandoned"]) {
      assert.equal(isOpen(lead({ stageKey })), false, stageKey);
    }
  });

  it("treats nurture as open, because it is parked rather than finished", () => {
    assert.equal(isOpen(lead({ stageKey: "long_term_nurture" })), true);
  });

  it("falls back to the status when a lead has no stage", () => {
    assert.equal(isOpen(lead({ stageKey: null, stageId: null, status: "CONVERTED" })), false);
    assert.equal(isOpen(lead({ stageKey: null, stageId: null, status: "NEW" })), true);
  });
});

describe("follow ups", () => {
  it("is overdue only once the date has actually passed", () => {
    assert.equal(
      isFollowUpOverdue(lead({ nextFollowUpAt: "2026-08-11T14:00:00" }), NOW),
      true,
    );
    // Later today is due, not overdue.
    assert.equal(
      isFollowUpOverdue(lead({ nextFollowUpAt: "2026-08-13T16:00:00" }), NOW),
      false,
    );
    assert.equal(isFollowUpDue(lead({ nextFollowUpAt: "2026-08-13T16:00:00" }), NOW), true);
  });

  it("leaves nurture alone until its own date arrives", () => {
    // The point of parking somebody is that they stop nagging. A nurture lead
    // that kept appearing would get marked lost just to silence it.
    const parked = lead({
      stageKey: "long_term_nurture",
      status: "NURTURE",
      nextFollowUpAt: "2026-01-01T09:00:00",
      nurtureUntil: "2026-12-01T09:00:00",
    });

    assert.equal(isFollowUpOverdue(parked, NOW), false);
    assert.equal(isFollowUpDue(parked, NOW), false);

    const ready = lead({
      stageKey: "long_term_nurture",
      status: "NURTURE",
      nurtureUntil: "2026-08-12T09:00:00",
    });

    assert.equal(isFollowUpDue(ready, NOW), true);
  });

  it("never chases a closed lead", () => {
    assert.equal(
      isFollowUpOverdue(lead({ stageKey: "won", nextFollowUpAt: "2026-01-01T09:00:00" }), NOW),
      false,
    );
  });

  it("queues overdue first, then by date, and leaves the unscheduled out", () => {
    const rows = [
      lead({ id: "later", nextFollowUpAt: "2026-08-13T18:00:00" }),
      lead({ id: "old", nextFollowUpAt: "2026-08-09T09:00:00" }),
      lead({ id: "none", nextFollowUpAt: null }),
      lead({ id: "yesterday", nextFollowUpAt: "2026-08-12T09:00:00" }),
    ];

    const queue = followUpQueue(rows, NOW, 5);

    assert.deepEqual(queue.map((row) => row.lead.id), ["old", "yesterday", "later"]);
    assert.equal(queue[0].overdueDays, 4);
    assert.equal(queue[2].isOverdue, false);
  });
});

describe("never contacted", () => {
  it("reads the contact date, not the stage", () => {
    // A lead can be dragged to "Contacted" without anybody picking up a phone.
    // Catching exactly that is the point of this counter.
    assert.equal(
      isNeverContacted(lead({ stageKey: "contacted", lastContactAt: null })),
      true,
    );
    assert.equal(
      isNeverContacted(lead({ stageKey: "new_website_lead", lastContactAt: "2026-08-01T09:00:00" })),
      false,
    );
  });

  it("ignores closed leads", () => {
    assert.equal(isNeverContacted(lead({ stageKey: "lost", lastContactAt: null })), false);
  });
});

describe("nothing scheduled", () => {
  it("flags an open lead with no follow up", () => {
    assert.equal(hasNoNextFollowUp(lead({ nextFollowUpAt: null })), true);
    assert.equal(hasNoNextFollowUp(lead()), false);
  });

  it("does not call a nurture lead adrift when it has a nurture date", () => {
    const parked = lead({
      stageKey: "long_term_nurture",
      nextFollowUpAt: null,
      nurtureUntil: "2026-12-01T09:00:00",
    });

    assert.equal(hasNoNextFollowUp(parked), false);
    assert.equal(hasNoNextFollowUp({ ...parked, nurtureUntil: null }), true);
  });

  it("flags a lead nobody has said what to do with", () => {
    assert.equal(hasNoNextAction(lead({ nextAction: null })), true);
    assert.equal(hasNoNextAction(lead({ nextAction: "   " })), true);
    assert.equal(hasNoNextAction(lead()), false);
  });
});

describe("proposal aging", () => {
  it("counts days only for proposals actually sitting in that stage", () => {
    const sent = lead({ stageKey: "proposal_sent", proposalSentAt: "2026-08-07T09:00:00" });

    assert.equal(proposalAgeDays(sent, NOW), 6);
    assert.equal(isProposalAging(sent, NOW, DEFAULT_PROPOSAL_AGING_DAYS), true);

    // Moved on to negotiation: no longer waiting.
    assert.equal(
      proposalAgeDays({ ...sent, stageKey: "negotiation" }, NOW),
      null,
    );
  });

  it("respects the threshold it is given rather than a constant", () => {
    const sent = lead({ stageKey: "proposal_sent", proposalSentAt: "2026-08-10T09:00:00" });

    assert.equal(isProposalAging(sent, NOW, 3), true);
    assert.equal(isProposalAging(sent, NOW, 10), false);
  });
});

describe("strategy calls", () => {
  it("counts a call booked for the day", () => {
    assert.equal(isCallOn(lead({ strategyCallAt: "2026-08-13T15:00:00" }), NOW), true);
    assert.equal(isCallOn(lead({ strategyCallAt: "2026-08-14T15:00:00" }), NOW), false);
  });

  it("does not count one that was cancelled or missed", () => {
    for (const strategyCallStatus of ["CANCELLED", "NO_SHOW"]) {
      assert.equal(
        isCallOn(lead({ strategyCallAt: "2026-08-13T15:00:00", strategyCallStatus }), NOW),
        false,
        strategyCallStatus,
      );
    }
  });
});

describe("the metric strip", () => {
  it("counts each open lead's value once, taking the most committed number", () => {
    // Adding the budget and the proposal would double-count one deal, which is
    // how a forecast comes to be worth nothing.
    const rows = [
      lead({ budgetAmount: 3000, proposalValue: 3500 }),
      lead({ budgetAmount: 2000, proposalValue: null }),
      lead({ stageKey: "won", budgetAmount: 9999, wonAt: "2026-08-12T09:00:00" }),
    ];

    assert.equal(salesMetrics(rows, MONTH, NOW).pipelineValue, 5500);
  });

  it("counts wins in the calendar month regardless of the selected range", () => {
    const rows = [
      lead({ stageKey: "won", wonAt: "2026-08-03T09:00:00" }),
      lead({ stageKey: "won", wonAt: "2026-07-30T09:00:00" }),
    ];

    assert.equal(salesMetrics(rows, resolveRange("today", NOW), NOW).wonThisMonth, 1);
  });

  it("rates conversion against what came in during the window", () => {
    const rows = [
      lead({ createdAt: "2026-08-02T09:00:00", stageKey: "won", wonAt: "2026-08-05T09:00:00" }),
      lead({ createdAt: "2026-08-03T09:00:00" }),
      lead({ createdAt: "2026-08-04T09:00:00" }),
      lead({ createdAt: "2026-08-05T09:00:00" }),
    ];

    assert.equal(salesMetrics(rows, MONTH, NOW).conversionRate, 25);
  });

  it("has no conversion rate when nothing came in, rather than zero", () => {
    // Zero would read as failure. Nothing arrived, which is a different fact.
    assert.equal(salesMetrics([], MONTH, NOW).conversionRate, null);
  });

  it("separates due from overdue", () => {
    const rows = [
      lead({ nextFollowUpAt: "2026-08-10T09:00:00" }),
      lead({ nextFollowUpAt: "2026-08-13T15:00:00" }),
      lead({ nextFollowUpAt: "2026-08-20T09:00:00" }),
    ];

    const metrics = salesMetrics(rows, MONTH, NOW);

    assert.equal(metrics.followUpsDue, 2);
    assert.equal(metrics.followUpsOverdue, 1);
  });
});

describe("needs action", () => {
  it("counts with the same predicate the card filters by", () => {
    // A card saying three that filters to two is worse than no card.
    const rows = [
      lead({ id: "a", nextFollowUpAt: "2026-08-09T09:00:00" }),
      lead({ id: "b", nextFollowUpAt: "2026-08-10T09:00:00" }),
      lead({ id: "c", lastContactAt: null }),
      lead({ id: "d", nextFollowUpAt: null }),
    ];

    for (const card of needsAction(rows, NOW)) {
      const filtered = rows.filter((row) =>
        matchesAction(row, card.key, NOW, DEFAULT_PROPOSAL_AGING_DAYS),
      );

      assert.equal(card.count, filtered.length, card.key);
    }
  });

  it("labels the aging card with the threshold in use", () => {
    const cards = needsAction([], NOW, 8);
    const aging = cards.find((card) => card.key === "aging-proposals");

    assert.match(aging?.label ?? "", /8\+ days/);
  });
});

describe("the pipeline strip", () => {
  it("counts leads into their own stage", () => {
    const stages = [
      { id: "s1", stageKey: "contacted", name: "Contacted", isTerminal: false },
      { id: "s2", stageKey: "qualified", name: "Qualified", isTerminal: false },
      { id: "s3", stageKey: "won", name: "Won", isTerminal: true },
    ];

    const rows = [
      lead({ stageId: "s1" }),
      lead({ stageId: "s1" }),
      lead({ stageId: "s3", stageKey: "won" }),
    ];

    const counts = pipelineCounts(rows, stages);

    assert.deepEqual(counts.map((row) => row.count), [2, 0, 1]);
    assert.equal(counts[2].isTerminal, true);
  });
});

describe("source performance", () => {
  it("credits a source for anybody who ever reached qualified", () => {
    // Counting only leads sitting in the stage right now would show a source
    // whose leads all closed as producing nothing qualified.
    const rows = [
      lead({ source: "REFERRAL", stageKey: "won", wonAt: "2026-08-05T09:00:00" }),
      lead({ source: "REFERRAL", stageKey: "contacted" }),
    ];

    const [referral] = sourcePerformance(rows, MONTH);

    assert.equal(referral.leads, 2);
    assert.equal(referral.qualified, 1);
    assert.equal(referral.converted, 1);
    assert.equal(referral.rate, 50);
  });

  it("only counts leads created inside the window", () => {
    const rows = [
      lead({ source: "PAID_ADS", createdAt: "2026-08-02T09:00:00" }),
      lead({ source: "PAID_ADS", createdAt: "2026-06-02T09:00:00" }),
    ];

    assert.equal(sourcePerformance(rows, MONTH)[0].leads, 1);
  });
});

describe("rep performance", () => {
  it("totals what each person brought in and closed", () => {
    const rows = [
      lead({ ownerId: "u1", ownerName: "Sarah", lastContactAt: "2026-08-11T09:00:00" }),
      lead({
        ownerId: "u1",
        ownerName: "Sarah",
        stageKey: "won",
        wonAt: "2026-08-12T09:00:00",
        finalValue: 3500,
      }),
      lead({ ownerId: "u2", ownerName: "John", lastContactAt: null }),
    ];

    const [sarah, john] = repPerformance(rows, MONTH);

    assert.equal(sarah.name, "Sarah");
    assert.equal(sarah.leads, 2);
    assert.equal(sarah.converted, 1);
    assert.equal(sarah.wonValue, 3500);
    assert.equal(john.contacted, 0);
  });

  it("leaves unassigned leads out rather than inventing a rep", () => {
    assert.deepEqual(repPerformance([lead({ ownerId: null })], MONTH), []);
  });
});

describe("recent wins", () => {
  it("returns the newest first", () => {
    const rows = [
      lead({ id: "older", stageKey: "won", wonAt: "2026-08-05T09:00:00" }),
      lead({ id: "newest", stageKey: "won", wonAt: "2026-08-12T09:00:00" }),
      lead({ id: "open" }),
    ];

    assert.deepEqual(recentWins(rows).map((row) => row.id), ["newest", "older"]);
  });
});

describe("filtering and sorting", () => {
  const rows = [
    lead({ id: "overdue", nextFollowUpAt: "2026-08-08T09:00:00", budgetAmount: 1000 }),
    lead({ id: "soon", nextFollowUpAt: "2026-08-13T16:00:00", budgetAmount: 9000 }),
    lead({ id: "unscheduled", nextFollowUpAt: null, budgetAmount: 5000 }),
  ];

  it("sorts unscheduled leads last, not first", () => {
    // An absent date reads as zero without this, floating a lead nobody has
    // scheduled above one that is genuinely overdue.
    const sorted = sortLeads(rows, "follow-up-soonest", NOW);

    assert.equal(sorted[sorted.length - 1].id, "unscheduled");
  });

  it("makes most-overdue mean something different from soonest", () => {
    const deep = sortLeads(rows, "most-overdue", NOW);

    assert.equal(deep[0].id, "overdue");
  });

  it("sorts by value", () => {
    assert.equal(sortLeads(rows, "highest-value", NOW)[0].id, "soon");
  });

  it("searches across the fields somebody would actually type", () => {
    const target = lead({
      contactName: "Jennifer Wilson",
      businessName: "Best Life Chiropractic",
      email: "jen@bestlife.com",
      ownerName: "Josri Ocana",
      nextAction: "Confirm strategy call",
    });

    for (const term of ["jennifer", "best life", "bestlife.com", "josri", "confirm strategy"]) {
      assert.equal(
        applySalesFilters([target], { ...EMPTY_SALES_FILTERS, search: term }, NOW).length,
        1,
        term,
      );
    }

    assert.equal(
      applySalesFilters([target], { ...EMPTY_SALES_FILTERS, search: "plumbing" }, NOW).length,
      0,
    );
  });

  it("combines a needs-action filter with the rest", () => {
    const result = applySalesFilters(
      rows,
      { ...EMPTY_SALES_FILTERS, action: "overdue" },
      NOW,
    );

    assert.deepEqual(result.map((row) => row.id), ["overdue"]);
  });
});

describe("how dates read", () => {
  it("says today, tomorrow and how overdue", () => {
    assert.match(followUpLabel("2026-08-13T14:00:00", NOW).label, /^Today,/);
    assert.match(followUpLabel("2026-08-14T10:00:00", NOW).label, /^Tomorrow,/);
    assert.equal(followUpLabel("2026-08-12T10:00:00", NOW).label, "Overdue by 1 day");
    assert.equal(followUpLabel("2026-08-10T10:00:00", NOW).label, "Overdue by 3 days");
    assert.equal(followUpLabel(null, NOW).tone, "none");
  });

  it("says never rather than leaving last contact blank", () => {
    assert.equal(lastContactLabel(null, NOW), "Never");
    assert.equal(lastContactLabel("2026-08-12T09:00:00", NOW), "Yesterday");
    assert.equal(lastContactLabel("2026-08-13T09:00:00", NOW), "Today");
  });
});

describe("date ranges", () => {
  it("runs this week from Monday", () => {
    assert.equal(resolveRange("week", NOW).from.getDay(), 1);
  });

  it("runs last 30 days inclusive of today", () => {
    const range = resolveRange("last30", NOW);
    const days = Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000);

    assert.equal(days, 30);
  });

  it("falls back to today rather than throwing on a bad custom range", () => {
    const range = resolveRange("custom", NOW, { from: "not-a-date", to: null });

    assert.equal(range.from.getDate(), 13);
  });
});
