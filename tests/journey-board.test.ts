import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_JOURNEY_FILTERS,
  type JourneyAccount,
  type JourneyRequirement,
  applyJourneyFilters,
  attentionItems,
  boardMetrics,
  deriveHealth,
  deriveProgress,
  exitReadiness,
  groupByPhase,
  healthBreakdown,
  isLaunchingSoon,
  isRenewalDue,
  matchesSummary,
  nextMilestone,
  phaseOf,
  sortJourneyAccounts,
  stageAging,
  summaryCards,
  upcomingMilestones,
} from "@/lib/journey/journey-board";
import { journeyStageForStoredStage } from "@/lib/journey/phases";

/**
 * The Journey derivations, tested without a database.
 *
 * Every rule the board shows - health, progress, aging, attention, milestone
 * order - is a pure function of an account, so each scenario the process cares
 * about can be stated as a fixture and asserted exactly.
 */

const NOW = new Date("2026-08-19T12:00:00.000Z");

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}

function daysAhead(days: number) {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString();
}

function requirement(
  key: string,
  satisfied: boolean,
  isBlocking = true,
): JourneyRequirement {
  return {
    key,
    label: key,
    isBlocking,
    satisfied,
    reason: satisfied ? null : `${key} is not met`,
  };
}

/** A healthy account in Payment Received, one day in, nothing wrong. */
function account(overrides: Partial<JourneyAccount> = {}): JourneyAccount {
  return {
    id: "c1",
    companyName: "Riverside Plumbing Group",
    clientName: "Dana Rivers",
    status: "ACTIVE",
    storedHealth: "GREEN",
    serviceType: "WEB_DEVELOPMENT",
    services: ["WEB_DEVELOPMENT"],

    stageId: "stage-payment",
    stageName: "Payment Received",
    stageKey: "payment_received",
    stageColor: "#16a34a",
    stagePosition: 1,
    isStageDeprecated: false,
    stageEnteredAt: daysAgo(0),
    stageTargetDays: 1,

    ownerId: "u1",
    ownerName: "Sarah Reyes",
    projectManagerName: "Sarah Reyes",

    currentBlocker: null,
    nextAction: null,
    nextActionDueAt: null,
    lastClientUpdateAt: daysAgo(1),
    renewalDate: null,
    contractEndDate: null,
    launchDate: null,

    openTaskCount: 0,
    completedTaskCount: 0,
    overdueTaskCount: 0,
    blockedTaskCount: 0,
    waitingTaskCount: 0,
    reviewTaskCount: 0,
    inProgressTaskCount: 0,
    criticalAccessMissing: 0,
    openDefectCount: 0,
    awaitingReviewCount: 0,
    intakeStatus: null,
    satisfactionScore: null,

    requirements: [],
    exitCriteria: [],
    nextStageId: "stage-onboarding",
    nextStageName: "Onboarding Form Sent",

    milestones: [],
    history: [],
    ...overrides,
  };
}

describe("journey stage grouping", () => {
  it("maps every stored fulfilment stage onto one of the twelve", () => {
    const storedKeys = [
      "payment_received",
      "onboarding_form_sent",
      "waiting_for_client_information",
      "access_collection",
      "onboarding_complete",
      "strategy_and_planning",
      "in_production",
      "internal_quality_assurance",
      "client_review",
      "revisions_required",
      "client_approved",
      "ready_for_launch",
      "live_active",
      "ongoing_management",
      "renewal_discussion",
      "offboarding",
      "project_completed",
      "archived",
    ];

    for (const [index, key] of storedKeys.entries()) {
      const stage = journeyStageForStoredStage(key, index + 1);

      assert.ok(stage, `${key} must resolve to a journey stage`);
      assert.ok(stage.position >= 1 && stage.position <= 12);
    }
  });

  it("keeps retired stages on the board rather than dropping the account", () => {
    const stage = journeyStageForStoredStage("waiting-on-client", 904);

    assert.equal(stage.key, "client_review");
    assert.equal(stage.phase, "LAUNCH");
  });

  it("falls back to position when a stage key is unknown", () => {
    const stage = journeyStageForStoredStage("something_added_later", 9);

    assert.ok(stage.position >= 1 && stage.position <= 12);
  });

  it("puts each of the four phases in the right column", () => {
    assert.equal(phaseOf(account({ stageKey: "onboarding_form_sent" })), "STARTUP");
    assert.equal(phaseOf(account({ stageKey: "in_production" })), "PRODUCTION");
    assert.equal(phaseOf(account({ stageKey: "ready_for_launch" })), "LAUNCH");
    assert.equal(phaseOf(account({ stageKey: "renewal_discussion" })), "RETENTION");
  });

  it("groups accounts into four columns and loses none", () => {
    const accounts = [
      account({ id: "a", stageKey: "payment_received" }),
      account({ id: "b", stageKey: "in_production" }),
      account({ id: "c", stageKey: "client_review" }),
      account({ id: "d", stageKey: "ongoing_management" }),
      account({ id: "e", stageKey: "internal_quality_assurance" }),
    ];

    const columns = groupByPhase(accounts);

    assert.deepEqual(
      columns.map((column) => column.accounts.length),
      [1, 2, 1, 1],
    );
    assert.equal(
      columns.reduce((total, column) => total + column.accounts.length, 0),
      accounts.length,
    );
  });
});

describe("stage aging", () => {
  it("counts a client just entering the journey as day zero", () => {
    const aging = stageAging(account(), NOW);

    assert.equal(aging.days, 0);
    assert.equal(aging.isOverTarget, false);
    assert.equal(aging.label, "Day 0 in stage");
  });

  it("reads out the day count while inside the target", () => {
    const aging = stageAging(
      account({ stageEnteredAt: daysAgo(3), stageTargetDays: 7 }),
      NOW,
    );

    assert.equal(aging.days, 3);
    assert.equal(aging.overBy, 0);
    assert.equal(aging.label, "Day 3 in stage");
  });

  it("switches to days over target once a client exceeds it", () => {
    const aging = stageAging(
      account({ stageEnteredAt: daysAgo(9), stageTargetDays: 7 }),
      NOW,
    );

    assert.equal(aging.overBy, 2);
    assert.equal(aging.isOverTarget, true);
    assert.equal(aging.label, "2 days over target");
  });

  it("uses the canonical fallback when a stage has no target of its own", () => {
    const aging = stageAging(
      account({
        stageKey: "in_production",
        stagePosition: 7,
        stageTargetDays: null,
        stageEnteredAt: daysAgo(2),
      }),
      NOW,
    );

    // Build / Implementation falls back to twenty-one days.
    assert.equal(aging.targetDays, 21);
    assert.equal(aging.isOverTarget, false);
  });

  it("never reports a target for a stage that has none anywhere", () => {
    const aging = stageAging(
      account({
        stageKey: "ongoing_management",
        stagePosition: 14,
        stageTargetDays: null,
        stageEnteredAt: daysAgo(400),
      }),
      NOW,
    );

    assert.equal(aging.targetDays, null);
    assert.equal(aging.isOverTarget, false, "no target means it cannot be exceeded");
  });
});

describe("client health", () => {
  it("calls a clean account on track", () => {
    assert.equal(deriveHealth(account(), NOW), "ON_TRACK");
  });

  it("calls an account waiting on access Waiting", () => {
    const waiting = account({
      stageKey: "access_collection",
      stagePosition: 4,
      stageTargetDays: 7,
      criticalAccessMissing: 2,
    });

    assert.equal(deriveHealth(waiting, NOW), "WAITING");
  });

  it("calls an account in client review Waiting", () => {
    const review = account({
      stageKey: "client_review",
      stagePosition: 9,
      stageTargetDays: 5,
      awaitingReviewCount: 1,
    });

    assert.equal(deriveHealth(review, NOW), "WAITING");
  });

  it("calls an account with a recorded blocker Blocked", () => {
    assert.equal(
      deriveHealth(account({ currentBlocker: "Domain registrar will not transfer" }), NOW),
      "BLOCKED",
    );
  });

  it("calls an account with blocked tasks Blocked", () => {
    assert.equal(deriveHealth(account({ blockedTaskCount: 1 }), NOW), "BLOCKED");
  });

  it("calls an account past its stage target At Risk", () => {
    const late = account({ stageEnteredAt: daysAgo(9), stageTargetDays: 7 });

    assert.equal(deriveHealth(late, NOW), "AT_RISK");
  });

  it("prefers At Risk over Waiting when a wait has run too long", () => {
    const both = account({
      stageKey: "client_review",
      stagePosition: 9,
      stageTargetDays: 5,
      awaitingReviewCount: 1,
      stageEnteredAt: daysAgo(12),
    });

    assert.equal(
      deriveHealth(both, NOW),
      "AT_RISK",
      "a wait that has gone on too long is the more useful thing to report",
    );
  });

  it("prefers Blocked over everything else", () => {
    const everything = account({
      currentBlocker: "Waiting on legal",
      stageEnteredAt: daysAgo(30),
      overdueTaskCount: 4,
      criticalAccessMissing: 2,
    });

    assert.equal(deriveHealth(everything, NOW), "BLOCKED");
  });

  it("respects a recorded red assessment even when nothing else is wrong", () => {
    assert.equal(deriveHealth(account({ storedHealth: "RED" }), NOW), "AT_RISK");
  });

  it("does not treat a stage target overrun as a missed milestone as well", () => {
    const late = account({
      stageEnteredAt: daysAgo(9),
      stageTargetDays: 7,
      milestones: [
        {
          id: "m",
          clientId: "c1",
          companyName: "Riverside Plumbing Group",
          name: "Payment Received",
          source: "stage-target",
          dueAt: daysAgo(2),
          completed: false,
        },
      ],
    });

    const reasons = attentionItems(late, NOW).map((item) => item.key);

    assert.ok(reasons.includes("stage-stalled"));
    assert.ok(
      !reasons.includes("milestone-overdue"),
      "the stage target is already reported as stage aging",
    );
  });
});

describe("progress", () => {
  it("scores a client entering the journey at the first stage boundary", () => {
    assert.equal(deriveProgress(account()), 0);
  });

  it("advances with the stage even before any gate is met", () => {
    const build = account({
      stageKey: "in_production",
      stagePosition: 7,
      exitCriteria: [requirement("qa_ready", false)],
    });

    // Build / Implementation is stage 5 of 12, so four stages are behind it.
    assert.equal(deriveProgress(build), 33);
  });

  it("gives partial credit for exit criteria already met", () => {
    const half = account({
      stageKey: "in_production",
      stagePosition: 7,
      exitCriteria: [
        requirement("a", true),
        requirement("b", true),
        requirement("c", false),
        requirement("d", false),
      ],
    });

    // Four stages done plus half of the fifth, over twelve.
    assert.equal(deriveProgress(half), 38);
  });

  it("reaches the next boundary when every exit criterion is met", () => {
    const ready = account({
      stageKey: "in_production",
      stagePosition: 7,
      exitCriteria: [requirement("a", true), requirement("b", true)],
    });

    assert.equal(deriveProgress(ready), 42);
  });

  it("falls back to task completion when a stage has no gates", () => {
    const noGates = account({
      stageKey: "in_production",
      stagePosition: 7,
      exitCriteria: [],
      completedTaskCount: 3,
      openTaskCount: 1,
    });

    // Four stages plus three quarters of the fifth.
    assert.equal(deriveProgress(noGates), 40);
  });

  it("never reports a hundred for an account still in the journey", () => {
    const late = account({
      stageKey: "renewal_discussion",
      stagePosition: 15,
      exitCriteria: [requirement("a", true)],
    });

    assert.ok(deriveProgress(late) < 100);
  });

  it("reports a hundred only once the journey is finished", () => {
    assert.equal(
      deriveProgress(account({ stageKey: "project_completed", stagePosition: 17 })),
      100,
    );
    assert.equal(
      deriveProgress(account({ stageKey: "archived", stagePosition: 18 })),
      100,
    );
  });
});

describe("stage exit criteria", () => {
  it("lets an account with every requirement complete advance", () => {
    const ready = exitReadiness(
      account({ exitCriteria: [requirement("a", true), requirement("b", true)] }),
    );

    assert.equal(ready.canAdvance, true);
    assert.equal(ready.met, 2);
    assert.equal(ready.message, null);
  });

  it("names how many requirements stop an incomplete account", () => {
    const blocked = exitReadiness(
      account({
        exitCriteria: [
          requirement("intake_complete", false),
          requirement("brand_assets", false),
          requirement("kickoff", true),
        ],
      }),
    );

    assert.equal(blocked.canAdvance, false);
    assert.equal(blocked.met, 1);
    assert.equal(
      blocked.message,
      "2 requirements must be completed before advancing.",
    );
  });

  it("uses the singular when exactly one requirement is outstanding", () => {
    const one = exitReadiness(account({ exitCriteria: [requirement("a", false)] }));

    assert.equal(one.message, "1 requirement must be completed before advancing.");
  });

  it("does not block on a non-blocking requirement", () => {
    const advisory = exitReadiness(
      account({ exitCriteria: [requirement("nice_to_have", false, false)] }),
    );

    assert.equal(advisory.canAdvance, true);
    assert.equal(advisory.message, null);
  });
});

describe("needs attention", () => {
  it("says nothing about an account with nothing wrong", () => {
    assert.deepEqual(attentionItems(account(), NOW), []);
  });

  it("surfaces a blocker first, with the action that opens it", () => {
    const blocked = account({
      currentBlocker: "Client has not approved the landing page",
      stageEnteredAt: daysAgo(4),
      stageTargetDays: 30,
    });

    const [first] = attentionItems(blocked, NOW);

    assert.equal(first.key, "blocker");
    assert.equal(first.problem, "Client has not approved the landing page");
    assert.equal(first.action, "View Blocker");
    assert.equal(first.ageLabel, "4 days");
  });

  it("reports missing access with a follow up", () => {
    const missing = account({
      stageKey: "access_collection",
      stagePosition: 4,
      stageTargetDays: 7,
      stageEnteredAt: daysAgo(4),
      criticalAccessMissing: 1,
    });

    const item = attentionItems(missing, NOW).find(
      (candidate) => candidate.key === "missing-access",
    );

    assert.ok(item);
    assert.equal(item.problem, "Waiting on 1 critical access record");
    assert.equal(item.action, "Follow Up");
  });

  it("reports an overdue client approval against the stage target", () => {
    const overdue = account({
      stageKey: "client_review",
      stagePosition: 9,
      stageTargetDays: 5,
      stageEnteredAt: daysAgo(8),
      awaitingReviewCount: 1,
    });

    const item = attentionItems(overdue, NOW).find(
      (candidate) => candidate.key === "approval-overdue",
    );

    assert.ok(item);
    assert.equal(item.problem, "Client approval overdue by 3 days");
    assert.equal(item.action, "Open Review");
  });

  it("reports an account stuck too long in one stage", () => {
    const stalled = account({ stageEnteredAt: daysAgo(6), stageTargetDays: 1 });

    const item = attentionItems(stalled, NOW).find(
      (candidate) => candidate.key === "stage-stalled",
    );

    assert.ok(item);
    assert.equal(item.problem, "5 days over the 1-day target for this stage");
  });

  it("reports an overdue milestone with how late it is", () => {
    const late = account({
      milestones: [
        {
          id: "m1",
          clientId: "c1",
          companyName: "Riverside Plumbing Group",
          name: "Strategy sign-off",
          source: "milestone",
          dueAt: daysAgo(3),
          completed: false,
        },
      ],
    });

    const item = attentionItems(late, NOW).find(
      (candidate) => candidate.key === "milestone-overdue",
    );

    assert.ok(item);
    assert.equal(item.problem, '"Strategy sign-off" was due 3 days ago');
  });

  it("ignores a milestone that has been completed", () => {
    const done = account({
      milestones: [
        {
          id: "m1",
          clientId: "c1",
          companyName: "Riverside Plumbing Group",
          name: "Strategy sign-off",
          source: "milestone",
          dueAt: daysAgo(3),
          completed: true,
        },
      ],
    });

    assert.deepEqual(attentionItems(done, NOW), []);
  });

  it("only reports overdue work when more than one item is late", () => {
    assert.equal(
      attentionItems(account({ overdueTaskCount: 1 }), NOW).some(
        (item) => item.key === "overdue-work",
      ),
      false,
    );

    assert.equal(
      attentionItems(account({ overdueTaskCount: 3 }), NOW).some(
        (item) => item.key === "overdue-work",
      ),
      true,
    );
  });

  it("chases a quiet client only while somebody is waiting on them", () => {
    const quietButNotWaiting = account({ lastClientUpdateAt: daysAgo(20) });

    assert.equal(
      attentionItems(quietButNotWaiting, NOW).some(
        (item) => item.key === "client-quiet",
      ),
      false,
      "an account nobody is waiting on is not overdue a reply",
    );

    const quietAndWaiting = account({
      lastClientUpdateAt: daysAgo(20),
      criticalAccessMissing: 1,
    });

    const item = attentionItems(quietAndWaiting, NOW).find(
      (candidate) => candidate.key === "client-quiet",
    );

    assert.ok(item);
    assert.equal(item.problem, "No client response for 20 days");
  });

  it("raises an approaching renewal and escalates one that has passed", () => {
    const soon = attentionItems(account({ renewalDate: daysAhead(10) }), NOW).find(
      (item) => item.key === "renewal-approaching",
    );

    assert.ok(soon);
    assert.equal(soon.problem, "Renewal due in 10 days");

    const passed = attentionItems(account({ renewalDate: daysAgo(4) }), NOW).find(
      (item) => item.key === "renewal-approaching",
    );

    assert.ok(passed);
    assert.equal(passed.problem, "Renewal date passed 4 days ago");
    assert.ok(passed.weight > soon.weight, "a missed renewal outranks an upcoming one");
  });

  it("flags an account nobody owns", () => {
    const orphan = attentionItems(account({ ownerId: null, ownerName: null }), NOW);

    assert.equal(orphan[0].key, "unowned");
    assert.equal(orphan[0].problem, "Nobody owns this account");
  });
});

describe("summary cards", () => {
  const accounts = [
    account({ id: "clean" }),
    account({ id: "waiting", criticalAccessMissing: 1 }),
    account({ id: "late", stageEnteredAt: daysAgo(9), stageTargetDays: 2 }),
    account({ id: "blocked", currentBlocker: "Stuck" }),
    account({ id: "launching", stageKey: "ready_for_launch", stagePosition: 12 }),
    account({ id: "renewing", renewalDate: daysAhead(12) }),
    account({ id: "done", stageKey: "archived", stagePosition: 18, status: "COMPLETED" }),
  ];

  it("counts only accounts still in the journey as active", () => {
    const cards = summaryCards(accounts, NOW);
    const active = cards.find((card) => card.key === "active");

    assert.ok(active);
    assert.equal(active.value, 6, "the archived account is not active");
  });

  it("counts each health state exactly once", () => {
    const cards = summaryCards(accounts, NOW);
    const value = (key: string) => cards.find((card) => card.key === key)?.value ?? 0;

    // Waiting / Blocked is one card, so it carries both states.
    assert.equal(value("on-track") + value("waiting") + value("at-risk"), 6);
  });

  it("keeps every count and its filter on the same predicate", () => {
    for (const card of summaryCards(accounts, NOW)) {
      const filtered = accounts.filter((row) => matchesSummary(row, card.key, NOW));

      assert.equal(
        filtered.length,
        card.value,
        `the ${card.key} card must filter to exactly what it counts`,
      );
    }
  });

  it("treats an approved account with no date as launching soon", () => {
    assert.equal(
      isLaunchingSoon(account({ stageKey: "ready_for_launch" }), NOW),
      true,
    );
    assert.equal(isLaunchingSoon(account({ launchDate: daysAhead(5) }), NOW), true);
    assert.equal(isLaunchingSoon(account({ launchDate: daysAhead(60) }), NOW), false);
  });

  it("counts a renewal that has already passed as due", () => {
    assert.equal(isRenewalDue(account({ renewalDate: daysAgo(5) }), NOW), true);
    assert.equal(isRenewalDue(account({ renewalDate: daysAhead(20) }), NOW), true);
    assert.equal(isRenewalDue(account({ renewalDate: daysAhead(90) }), NOW), false);
  });

  it("falls back to the contract end date when no renewal date is set", () => {
    assert.equal(isRenewalDue(account({ contractEndDate: daysAhead(10) }), NOW), true);
  });

  it("adds the health breakdown up to the active total", () => {
    const slices = healthBreakdown(accounts, NOW);

    assert.equal(
      slices.reduce((total, slice) => total + slice.value, 0),
      6,
    );
  });
});

describe("milestones", () => {
  const withMilestones = account({
    milestones: [
      {
        id: "m-late",
        clientId: "c1",
        companyName: "Riverside Plumbing Group",
        name: "Overdue thing",
        source: "milestone",
        dueAt: daysAgo(2),
        completed: false,
      },
      {
        id: "m-next",
        clientId: "c1",
        companyName: "Riverside Plumbing Group",
        name: "Internal QA",
        source: "milestone",
        dueAt: daysAhead(1),
        completed: false,
      },
      {
        id: "m-later",
        clientId: "c1",
        companyName: "Riverside Plumbing Group",
        name: "Launch",
        source: "launch",
        dueAt: daysAhead(9),
        completed: false,
      },
    ],
  });

  it("treats an overdue milestone as still the next thing to happen", () => {
    const next = nextMilestone(withMilestones, NOW);

    assert.ok(next);
    assert.equal(next.name, "Internal QA", "the soonest one still ahead comes first");
  });

  it("returns the overdue one when nothing else is scheduled", () => {
    const onlyLate = account({ milestones: [withMilestones.milestones[0]] });
    const next = nextMilestone(onlyLate, NOW);

    assert.ok(next);
    assert.equal(next.name, "Overdue thing");
  });

  it("orders the panel by date and skips completed work", () => {
    const done = { ...withMilestones.milestones[1], id: "m-done", completed: true };
    const feed = upcomingMilestones(
      [account({ milestones: [...withMilestones.milestones, done] })],
      NOW,
    );

    assert.deepEqual(
      feed.map((milestone) => milestone.name),
      ["Overdue thing", "Internal QA", "Launch"],
    );
  });

  it("leaves finished accounts out of the panel", () => {
    const feed = upcomingMilestones(
      [
        account({
          id: "archived",
          stageKey: "archived",
          stagePosition: 18,
          milestones: withMilestones.milestones,
        }),
      ],
      NOW,
    );

    assert.deepEqual(feed, []);
  });
});

describe("search, filters and sort", () => {
  const accounts = [
    account({ id: "a", companyName: "Metro South Chamber", ownerId: "u1" }),
    account({
      id: "b",
      companyName: "Epic Dog Academy",
      ownerId: "u2",
      ownerName: "Joeri Aqui",
      projectManagerName: "Joeri Aqui",
      services: ["PAID_ADVERTISING"],
      serviceType: "PAID_ADVERTISING",
      currentBlocker: "Ad account suspended",
    }),
    account({
      id: "c",
      companyName: "Coastal PDR Training",
      stageId: "stage-qa",
      stageName: "Internal Quality Assurance",
      stageKey: "internal_quality_assurance",
      stagePosition: 8,
      stageEnteredAt: daysAgo(12),
      stageTargetDays: 3,
      launchDate: daysAhead(6),
      renewalDate: daysAhead(20),
    }),
  ];

  it("searches company, contact, stage and owner", () => {
    const bySearch = (search: string) =>
      applyJourneyFilters(accounts, { ...EMPTY_JOURNEY_FILTERS, search }, NOW).map(
        (row) => row.id,
      );

    assert.deepEqual(bySearch("metro"), ["a"]);
    assert.deepEqual(bySearch("joeri"), ["b"]);
    assert.deepEqual(bySearch("quality assurance"), ["c"]);
    assert.deepEqual(bySearch("  "), ["a", "b", "c"], "a blank search filters nothing");
  });

  it("filters by stage, manager, health and service", () => {
    const only = (filters: Partial<typeof EMPTY_JOURNEY_FILTERS>) =>
      applyJourneyFilters(accounts, { ...EMPTY_JOURNEY_FILTERS, ...filters }, NOW).map(
        (row) => row.id,
      );

    assert.deepEqual(only({ stageId: "stage-qa" }), ["c"]);
    assert.deepEqual(only({ ownerId: "u2" }), ["b"]);
    assert.deepEqual(only({ health: "BLOCKED" }), ["b"]);
    assert.deepEqual(only({ health: "AT_RISK" }), ["c"]);
    assert.deepEqual(only({ service: "PAID_ADVERTISING" }), ["b"]);
  });

  it("filters by launch and renewal horizons", () => {
    const only = (filters: Partial<typeof EMPTY_JOURNEY_FILTERS>) =>
      applyJourneyFilters(accounts, { ...EMPTY_JOURNEY_FILTERS, ...filters }, NOW).map(
        (row) => row.id,
      );

    assert.deepEqual(only({ launchWithinDays: 14 }), ["c"]);
    assert.deepEqual(only({ renewalWithinDays: 30 }), ["c"]);
    assert.deepEqual(
      only({ renewalWithinDays: 5 }),
      [],
      "an account renewing in twenty days is outside a five day horizon",
    );
  });

  it("sorts the noisiest account to the top by default", () => {
    const sorted = sortJourneyAccounts(accounts, "needs-attention", NOW);

    assert.equal(sorted[0].id, "b", "the blocked account outranks the late one");
  });

  it("sorts by longest in stage", () => {
    const sorted = sortJourneyAccounts(accounts, "longest-in-stage", NOW);

    assert.equal(sorted[0].id, "c");
  });

  it("sorts by soonest launch, leaving accounts without a date last", () => {
    const sorted = sortJourneyAccounts(accounts, "launch-soonest", NOW);

    assert.equal(sorted[0].id, "c");
  });

  it("sorts by soonest renewal", () => {
    const sorted = sortJourneyAccounts(accounts, "renewal-soonest", NOW);

    assert.equal(sorted[0].id, "c");
  });
});

describe("board metrics", () => {
  it("averages days in stage across active accounts only", () => {
    const metrics = boardMetrics(
      [
        account({ id: "a", stageEnteredAt: daysAgo(2) }),
        account({ id: "b", stageEnteredAt: daysAgo(4) }),
        account({
          id: "archived",
          stageKey: "archived",
          stagePosition: 18,
          stageEnteredAt: daysAgo(300),
        }),
      ],
      NOW,
    );

    assert.equal(metrics.activeCount, 2);
    assert.equal(metrics.avgDaysInStage, 3);
  });

  it("reports on-time progress as the share inside the stage target", () => {
    const metrics = boardMetrics(
      [
        account({ id: "a", stageEnteredAt: daysAgo(0) }),
        account({ id: "b", stageEnteredAt: daysAgo(9), stageTargetDays: 2 }),
      ],
      NOW,
    );

    assert.equal(metrics.onTimeCount, 1);
    assert.equal(metrics.onTimePercent, 50);
  });

  it("reports no satisfaction score rather than a zero when none is recorded", () => {
    assert.equal(boardMetrics([account()], NOW).satisfaction, null);

    const scored = boardMetrics(
      [account({ satisfactionScore: 4 }), account({ id: "b", satisfactionScore: 5 })],
      NOW,
    );

    assert.equal(scored.satisfaction, 4.5);
    assert.equal(scored.satisfactionResponses, 2);
  });

  it("holds up with no accounts at all", () => {
    const metrics = boardMetrics([], NOW);

    assert.equal(metrics.avgDaysInStage, 0);
    assert.equal(metrics.onTimePercent, 0);
    assert.equal(metrics.atRiskCount, 0);
  });
});
