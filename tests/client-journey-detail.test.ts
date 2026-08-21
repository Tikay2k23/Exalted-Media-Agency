import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  type DetailTask,
  type JourneyClientDetail,
  type JourneyFlag,
  attentionCards,
  focusTasks,
  nextStep,
  requirementGroups,
  stageClock,
  taskProgress,
  workSummary,
} from "@/lib/journey/client-detail";
import {
  type JourneyAccount,
  type JourneyRequirement,
  explainHealth,
  requirementSort,
} from "@/lib/journey/journey-board";

/**
 * The client journey page's decisions, tested without a database.
 *
 * The page exists to answer "what do I do next", so most of what matters here
 * is that the single next step it offers is the right one for the state the
 * account is actually in.
 */

const NOW = new Date("2026-08-24T12:00:00.000Z");

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
    owner: "Project Manager",
    isBlocking,
    satisfied,
    reason: satisfied ? null : "not met",
  };
}

function task(overrides: Partial<DetailTask> = {}): DetailTask {
  return {
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    title: "A task",
    status: "TODO",
    dueDate: daysAhead(3),
    estimatedHours: 4,
    actualHours: null,
    assigneeName: "Sarah Reyes",
    ...overrides,
  };
}

function account(overrides: Partial<JourneyAccount> = {}): JourneyAccount {
  return {
    id: "c1",
    companyName: "Metro South Chamber",
    clientName: "Dana Rivers",
    status: "ACTIVE",
    storedHealth: "GREEN",
    serviceType: "CRM_AUTOMATION",
    services: ["CRM_AUTOMATION"],

    stageId: "stage-production",
    stageName: "In Production",
    stageKey: "in_production",
    stageColor: "#ea580c",
    stagePosition: 7,
    isStageDeprecated: false,
    stageEnteredAt: daysAgo(6),
    stageTargetDays: 8,

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

    openTaskCount: 3,
    completedTaskCount: 5,
    overdueTaskCount: 0,
    blockedTaskCount: 0,
    waitingTaskCount: 0,
    reviewTaskCount: 0,
    inProgressTaskCount: 2,
    criticalAccessMissing: 0,
    openDefectCount: 0,
    awaitingReviewCount: 0,
    intakeStatus: null,
    satisfactionScore: null,

    requirements: [],
    exitCriteria: [],
    nextStageId: "stage-qa",
    nextStageName: "Internal Quality Assurance",

    milestones: [],
    history: [],
    ...overrides,
  };
}

function detail(overrides: Partial<JourneyClientDetail> = {}): JourneyClientDetail {
  return {
    account: account(),
    stages: [],
    flags: [],
    tasks: [],
    contacts: [],
    milestones: [],
    activity: [],
    projectStartDate: null,
    targetLaunchDate: null,
    renewalDate: null,
    canMove: true,
    canOverride: true,
    canManageFlags: true,
    ...overrides,
  };
}

function flag(overrides: Partial<JourneyFlag> = {}): JourneyFlag {
  return {
    id: "f1",
    kind: "WAITING_ON_CLIENT",
    reason: "Waiting for API credentials",
    detail: "GoHighLevel API key from their web team",
    responsibleParty: "Client",
    dueAt: NOW.toISOString(),
    round: null,
    raisedByName: "Sarah Reyes",
    raisedAt: daysAgo(4),
    ...overrides,
  };
}

describe("stage clock", () => {
  it("reads out day N of the target", () => {
    const clock = stageClock(account(), NOW);

    assert.equal(clock.day, 6);
    assert.equal(clock.targetDays, 8);
    assert.equal(clock.label, "Day 6 of 8");
    assert.equal(clock.remaining, 2);
    assert.equal(clock.remainingLabel, "2 days remaining");
    assert.equal(clock.isOverTarget, false);
  });

  it("counts the overrun once the target has passed", () => {
    const clock = stageClock(account({ stageEnteredAt: daysAgo(11) }), NOW);

    assert.equal(clock.isOverTarget, true);
    assert.equal(clock.remaining, -3);
    assert.equal(clock.remainingLabel, "3 days over");
  });

  it("drops the target when the stage has none", () => {
    const clock = stageClock(
      account({ stageKey: "ongoing_management", stagePosition: 14, stageTargetDays: null }),
      NOW,
    );

    assert.equal(clock.targetDays, null);
    assert.equal(clock.label, "Day 6");
    assert.equal(clock.remainingLabel, null);
  });
});

describe("requirements", () => {
  it("splits required from optional on the blocking flag", () => {
    const groups = requirementGroups([
      requirement("workflow", true),
      requirement("routing", true),
      requirement("final_test", false),
      requirement("reporting_dashboard", false, false),
    ]);

    assert.equal(groups.required.length, 3);
    assert.equal(groups.optional.length, 1);
    assert.equal(groups.met, 2);
    assert.equal(groups.total, 4);
    assert.deepEqual(
      groups.outstanding.map((entry) => entry.key),
      ["final_test"],
      "only unmet blocking requirements actually hold the stage shut",
    );
  });

  it("sorts what is stopping you to the top", () => {
    const sorted = [
      requirement("done_one", true),
      requirement("advisory", false, false),
      requirement("blocking", false),
    ].sort(requirementSort);

    assert.deepEqual(
      sorted.map((entry) => entry.key),
      ["blocking", "advisory", "done_one"],
    );
  });
});

describe("work", () => {
  it("counts each status once", () => {
    const summary = workSummary([
      task({ status: "DONE" }),
      task({ status: "APPROVED" }),
      task({ status: "IN_PROGRESS" }),
      task({ status: "BLOCKED" }),
      task({ status: "TODO" }),
    ]);

    assert.equal(summary.total, 5);
    assert.equal(summary.completed, 2);
    assert.equal(summary.inProgress, 1);
    assert.equal(summary.blocked, 1);
    assert.equal(summary.todo, 1);
  });

  it("reports no progress rather than inventing one", () => {
    assert.equal(
      taskProgress(task({ status: "IN_PROGRESS", actualHours: null })),
      null,
      "a task with no time logged has no measurable progress",
    );
    assert.equal(taskProgress(task({ status: "IN_PROGRESS", actualHours: 3 })), 75);
    assert.equal(taskProgress(task({ status: "DONE" })), 100);
  });

  it("never lets an unfinished task read as complete", () => {
    assert.equal(
      taskProgress(task({ status: "IN_PROGRESS", estimatedHours: 2, actualHours: 40 })),
      99,
    );
  });

  it("puts blocked and overdue work in front", () => {
    const focus = focusTasks(
      [
        task({ id: "done", status: "DONE" }),
        task({ id: "todo", status: "TODO" }),
        task({ id: "blocked", status: "BLOCKED" }),
        task({ id: "late", status: "IN_PROGRESS", dueDate: daysAgo(2) }),
      ],
      NOW,
    );

    assert.deepEqual(
      focus.map((entry) => entry.id),
      ["blocked", "late", "todo"],
    );
    assert.ok(!focus.some((entry) => entry.id === "done"), "finished work is not a focus");
  });
});

describe("what happens next", () => {
  it("offers the blocker first when one is raised", () => {
    const step = nextStep(
      detail({
        flags: [flag({ kind: "BLOCKED", reason: "Domain registrar will not transfer" })],
        account: account({ exitCriteria: [requirement("qa", false)] }),
      }),
    );

    assert.equal(step.kind, "resolve-blocker");
    assert.equal(step.action, "Resolve Blocker");
    assert.equal(step.detail, "Domain registrar will not transfer");
  });

  it("chases the client before chasing the requirements", () => {
    const step = nextStep(
      detail({
        flags: [flag()],
        account: account({ exitCriteria: [requirement("qa", false)] }),
      }),
    );

    assert.equal(step.kind, "chase-client");
    assert.equal(step.action, "Send Follow-Up");
  });

  it("names how many requirements are left when nothing is blocked", () => {
    const step = nextStep(
      detail({
        account: account({
          exitCriteria: [
            requirement("a", true),
            requirement("b", false),
            requirement("c", false),
          ],
        }),
      }),
    );

    assert.equal(step.kind, "complete-requirements");
    assert.equal(step.action, "Complete Requirements");
    assert.match(step.detail, /2 requirements/);
  });

  it("sends you to the work when the gates are clear but tasks are open", () => {
    const step = nextStep(
      detail({
        account: account({ exitCriteria: [requirement("a", true)] }),
        tasks: [task({ status: "IN_PROGRESS" }), task({ status: "TODO" })],
      }),
    );

    assert.equal(step.kind, "continue-work");
    assert.equal(step.action, "Continue Work");
  });

  it("offers the move once everything is done", () => {
    const step = nextStep(
      detail({
        account: account({ exitCriteria: [requirement("a", true)] }),
        tasks: [task({ status: "DONE" })],
      }),
    );

    assert.equal(step.kind, "ready-to-advance");
    assert.equal(step.action, "Move to Internal Quality Assurance");
  });

  it("says so at the end of the journey", () => {
    const step = nextStep(
      detail({ account: account({ nextStageId: null, nextStageName: null }) }),
    );

    assert.equal(step.kind, "journey-complete");
  });
});

describe("needs attention", () => {
  it("says nothing about a clean account", () => {
    assert.deepEqual(attentionCards(detail(), NOW), []);
  });

  it("leads with a raised condition and how long it has run", () => {
    const [card] = attentionCards(detail({ flags: [flag()] }), NOW);

    assert.equal(card.title, "Waiting for API credentials");
    assert.equal(card.action, "Send Follow-Up");
    assert.ok(card.lines.some((line) => line.includes("4 days")));
    assert.ok(card.lines.some((line) => line.includes("Responsible: Client")));
    assert.ok(
      card.lines.some((line) => line.includes("Today")),
      "a follow-up due today says today",
    );
  });

  it("reports overdue work with the worst one named", () => {
    const cards = attentionCards(
      detail({
        tasks: [
          task({ title: "Tracking Configuration", status: "BLOCKED", dueDate: daysAgo(2) }),
          task({ title: "Later thing", status: "TODO", dueDate: daysAhead(4) }),
        ],
      }),
      NOW,
    );

    const overdue = cards.find((card) => card.key === "overdue-tasks");

    assert.ok(overdue);
    assert.equal(overdue.title, "1 task overdue");
    assert.ok(overdue.lines.includes("Tracking Configuration"));
    assert.ok(overdue.lines.some((line) => line.includes("2 days overdue")));
  });

  it("reports a stage that has run past its target", () => {
    const cards = attentionCards(
      detail({ account: account({ stageEnteredAt: daysAgo(11) }) }),
      NOW,
    );

    const stage = cards.find((card) => card.key === "stage-overdue");

    assert.ok(stage);
    assert.ok(stage.lines.some((line) => line.includes("3 days past the 8-day target")));
  });

  it("shows a paused account as paused rather than waiting", () => {
    const [card] = attentionCards(
      detail({ flags: [flag({ kind: "PAUSED", reason: "Client on leave" })] }),
      NOW,
    );

    assert.equal(card.action, "Resume Journey");
    assert.ok(card.lines[0].startsWith("Paused since"));
  });
});

describe("health explanation", () => {
  it("gives no reasons when nothing is wrong", () => {
    const explained = explainHealth(account(), NOW);

    assert.equal(explained.health, "ON_TRACK");
    assert.deepEqual(explained.reasons, []);
  });

  it("lists every reason behind an at-risk verdict", () => {
    const explained = explainHealth(
      account({
        stageEnteredAt: daysAgo(11),
        overdueTaskCount: 2,
        milestones: [
          {
            id: "m1",
            clientId: "c1",
            companyName: "Metro South Chamber",
            name: "Production complete",
            source: "milestone",
            dueAt: daysAgo(1),
            completed: false,
          },
        ],
      }),
      NOW,
    );

    assert.equal(explained.health, "AT_RISK");
    assert.ok(explained.reasons.some((reason) => reason.includes("3 days over")));
    assert.ok(explained.reasons.some((reason) => reason.includes("2 overdue tasks")));
    assert.ok(explained.reasons.some((reason) => reason.includes("1 overdue milestone")));
  });

  it("explains a waiting verdict with what is being waited on", () => {
    const explained = explainHealth(account({ criticalAccessMissing: 2 }), NOW);

    assert.equal(explained.health, "WAITING");
    assert.ok(
      explained.reasons.some((reason) => reason.includes("2 critical access records")),
    );
  });

  it("never claims a verdict the badge does not show", () => {
    const blocked = account({ currentBlocker: "Registrar will not transfer" });
    const explained = explainHealth(blocked, NOW);

    assert.equal(explained.health, "BLOCKED");
    assert.ok(explained.reasons.includes("Registrar will not transfer"));
  });
});
