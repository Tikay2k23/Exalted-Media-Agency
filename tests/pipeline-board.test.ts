import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOARD_COLUMNS,
  OFF_BOARD_STAGE_KEYS,
  buildBoard,
  columnFor,
  dropTargetStageKey,
  initialsOf,
  isRealMove,
  opportunityValue,
  stageTag,
} from "@/lib/sales/pipeline-board";
import type { SalesLead } from "@/lib/sales/sales-view";

function lead(overrides: Partial<SalesLead> = {}): SalesLead {
  return {
    id: Math.random().toString(36).slice(2),
    contactId: "contact-1",
    contactName: "Marcus Lee",
    businessName: "Precision Auto Works",
    opportunityName: "Paid Advertising",
    email: null,
    phone: null,
    source: "WEBSITE_FORM",
    status: "CONTACTED",
    stageId: "stage-1",
    stageKey: "contacted",
    stageName: "Contacted",
    ownerId: "user-1",
    ownerName: "Sarah Reyes",
    nextAction: "Prepare proposal",
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
    budgetAmount: 3500,
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

describe("seven columns over thirteen stages", () => {
  it("collapses the finer stages into the column they belong to", () => {
    assert.equal(columnFor(lead({ stageKey: "new_website_lead" })), "new-lead");
    assert.equal(columnFor(lead({ stageKey: "application_submitted" })), "new-lead");
    assert.equal(columnFor(lead({ stageKey: "attempting_contact" })), "contacted");
    assert.equal(columnFor(lead({ stageKey: "contacted" })), "contacted");
    assert.equal(columnFor(lead({ stageKey: "strategy_call_booked" })), "strategy-call");
    assert.equal(columnFor(lead({ stageKey: "strategy_call_showed" })), "strategy-call");
  });

  it("keeps lost, nurture and abandoned off the board without losing them", () => {
    // A board whose last columns fill with dead deals stops being a picture of
    // live work. The records are untouched; they are just not columns.
    for (const stageKey of OFF_BOARD_STAGE_KEYS) {
      assert.equal(columnFor(lead({ stageKey })), null, stageKey);
    }
  });

  it("drops onto the earliest stage in the column", () => {
    // Dropping onto Strategy Call means the call is booked, not that somebody
    // already attended it - the board must not credit a meeting that has not
    // happened.
    assert.equal(dropTargetStageKey("strategy-call"), "strategy_call_booked");
    assert.equal(dropTargetStageKey("contacted"), "contacted");
    assert.equal(dropTargetStageKey("new-lead"), "new_website_lead");
    assert.equal(dropTargetStageKey("won"), "won");
  });

  it("has exactly the seven columns asked for, in order", () => {
    assert.deepEqual(
      BOARD_COLUMNS.map((column) => column.label),
      ["New Lead", "Contacted", "Strategy Call", "Qualified", "Proposal", "Negotiation", "Won"],
    );
  });
});

describe("the automatic stage tag", () => {
  it("follows the stage, because it is derived from it", () => {
    assert.equal(stageTag(lead({ stageKey: "contacted" })), "stage_contacted");
    assert.equal(stageTag(lead({ stageKey: "qualified" })), "stage_qualified");
    assert.equal(stageTag(lead({ stageKey: "proposal_sent" })), "stage_proposal");
    assert.equal(stageTag(lead({ stageKey: "negotiation" })), "stage_negotiation");
    assert.equal(stageTag(lead({ stageKey: "won" })), "stage_won");
  });

  it("gives the two finer stages the same tag as their column", () => {
    assert.equal(stageTag(lead({ stageKey: "attempting_contact" })), "stage_contacted");
    assert.equal(stageTag(lead({ stageKey: "strategy_call_showed" })), "stage_strategy_call");
  });

  it("still tags a lead that sits off the board", () => {
    assert.equal(stageTag(lead({ stageKey: "lost" })), "stage_lost");
    assert.equal(stageTag(lead({ stageKey: null })), null);
  });
});

describe("columns and totals", () => {
  it("counts and sums each column from the rows given", () => {
    const rows = [
      lead({ stageKey: "contacted", budgetAmount: 1000 }),
      lead({ stageKey: "attempting_contact", budgetAmount: 2000 }),
      lead({ stageKey: "qualified", budgetAmount: 5000 }),
      lead({ stageKey: "lost", budgetAmount: 9999 }),
    ];

    const board = buildBoard(rows);
    const contacted = board.find((cell) => cell.column.key === "contacted");
    const qualified = board.find((cell) => cell.column.key === "qualified");

    assert.equal(contacted?.count, 2);
    assert.equal(contacted?.value, 3000);
    assert.equal(qualified?.count, 1);
    // The lost deal is in no column, so its value is in no total.
    assert.equal(board.reduce((sum, cell) => sum + cell.value, 0), 8000);
  });

  it("values an opportunity at the most committed number, once", () => {
    // Adding the budget and the proposal would count one deal twice.
    assert.equal(opportunityValue(lead({ budgetAmount: 3000, proposalValue: 3500 })), 3500);
    assert.equal(opportunityValue(lead({ budgetAmount: 3000, proposalValue: null })), 3000);
    assert.equal(
      opportunityValue(lead({ budgetAmount: 3000, proposalValue: 3500, finalValue: 4000 })),
      4000,
    );
  });

  it("puts the card needing attention soonest at the top", () => {
    const rows = [
      lead({ id: "later", stageKey: "contacted", nextFollowUpAt: "2026-09-01T09:00:00" }),
      lead({ id: "none", stageKey: "contacted", nextFollowUpAt: null }),
      lead({ id: "soon", stageKey: "contacted", nextFollowUpAt: "2026-08-13T09:00:00" }),
    ];

    const contacted = buildBoard(rows).find((cell) => cell.column.key === "contacted");

    assert.deepEqual(contacted?.leads.map((row) => row.id), ["soon", "later", "none"]);
  });

  it("returns all seven columns even with no leads at all", () => {
    const board = buildBoard([]);

    assert.equal(board.length, 7);
    assert.ok(board.every((cell) => cell.count === 0 && cell.value === 0));
  });
});

describe("what counts as a move", () => {
  it("ignores a card dropped back into its own column", () => {
    // Writing one would put a meaningless row in the history, and would demote
    // a contacted lead back to attempting contact for no reason.
    assert.equal(isRealMove(lead({ stageKey: "contacted" }), "contacted"), false);
    assert.equal(isRealMove(lead({ stageKey: "attempting_contact" }), "contacted"), false);
    assert.equal(isRealMove(lead({ stageKey: "contacted" }), "qualified"), true);
  });
});

describe("assignee initials", () => {
  it("takes the first letter of the first two words", () => {
    assert.equal(initialsOf("Sarah Reyes"), "SR");
    assert.equal(initialsOf("Mark Angelo Yakit"), "MA");
    assert.equal(initialsOf("Josri"), "J");
    assert.equal(initialsOf(null), "??");
  });
});
