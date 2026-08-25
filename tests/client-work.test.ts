import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DUE_SOON_DAYS,
  type WorkTask,
  biggestRisk,
  eodState,
  isDueSoon,
  isOverdue,
  matchesMetric,
  oldestOverdue,
  teamOnAccount,
  workHealth,
  workMetrics,
} from "@/lib/clients/client-work";

const NOW = new Date("2026-05-28T14:00:00.000Z");

function days(offset: number) {
  const date = new Date(NOW);

  date.setDate(date.getDate() + offset);

  return date.toISOString();
}

function task(overrides: Partial<WorkTask> = {}): WorkTask {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Build onboarding automation",
    note: null,
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    category: "CRM_AND_AUTOMATION",
    dueDate: days(5),
    startDate: days(-3),
    completedAt: null,
    archivedAt: null,
    assignee: { id: "u1", name: "Josri Santos", role: "TEAM_MEMBER" },
    reviewerId: null,
    projectId: "p1",
    projectName: "CRM & Automation Setup",
    blocker: null,
    requiresApproval: false,
    latestEodDate: null,
    unmetDependencies: 0,
    ...overrides,
  };
}

/**
 * The six cards.
 *
 * They are the filters as well as the counts, so a number that does not match
 * the rows behind it is not a cosmetic problem - it is the page contradicting
 * itself. Every count here is asserted through the same predicate the table
 * filters with.
 */
describe("work metrics", () => {
  it("counts open work as active, whatever state it is in", () => {
    const tasks = [
      task({ status: "TODO" }),
      task({ status: "IN_PROGRESS" }),
      task({ status: "BLOCKED" }),
      task({ status: "WAITING_CLIENT" }),
      task({ status: "NEEDS_REVIEW" }),
      task({ status: "DONE", completedAt: days(-1) }),
      task({ status: "CANCELLED" }),
    ];

    const active = workMetrics(tasks, NOW).find((card) => card.key === "active");

    assert.equal(active?.value, 5);
  });

  it("does not count archived work as active", () => {
    const tasks = [task({ status: "TODO" }), task({ status: "TODO", archivedAt: days(-1) })];

    assert.equal(workMetrics(tasks, NOW).find((card) => card.key === "active")?.value, 1);
  });

  it("keeps overdue out of due soon, so the two cards do not double count", () => {
    const late = task({ dueDate: days(-2) });
    const soon = task({ dueDate: days(1) });

    assert.equal(isOverdue(late, NOW), true);
    assert.equal(isDueSoon(late, NOW), false);
    assert.equal(isDueSoon(soon, NOW), true);
  });

  it("treats work due today as due soon rather than overdue", () => {
    const today = task({ dueDate: NOW.toISOString() });

    assert.equal(isOverdue(today, NOW), false);
    assert.equal(isDueSoon(today, NOW), true);
  });

  it("stops counting due soon past the window", () => {
    assert.equal(isDueSoon(task({ dueDate: days(DUE_SOON_DAYS) }), NOW), true);
    assert.equal(isDueSoon(task({ dueDate: days(DUE_SOON_DAYS + 2) }), NOW), false);
  });

  it("counts only this month as completed this month", () => {
    const tasks = [
      task({ status: "DONE", completedAt: days(-2) }),
      task({ status: "APPROVED", completedAt: days(-1) }),
      task({ status: "DONE", completedAt: "2026-04-14T10:00:00.000Z" }),
      task({ status: "DONE", completedAt: null }),
    ];

    const card = workMetrics(tasks, NOW).find((metric) => metric.key === "completedThisMonth");

    assert.equal(card?.value, 2);
  });

  it("returns the six cards the page shows, in order", () => {
    assert.deepEqual(
      workMetrics([], NOW).map((card) => card.key),
      ["active", "dueSoon", "overdue", "blocked", "needsReview", "completedThisMonth"],
    );
  });

  it("counts nothing as nothing rather than failing", () => {
    for (const card of workMetrics([], NOW)) assert.equal(card.value, 0);
  });
});

/**
 * Waiting on the client is not blocked.
 *
 * They are chased differently - one by asking the client, one by fixing
 * something of ours - so a project manager who cannot tell them apart is being
 * pointed at the wrong job.
 */
describe("waiting on the client against blocked", () => {
  it("does not count waiting work as blocked", () => {
    const waiting = task({ status: "WAITING_CLIENT" });

    assert.equal(matchesMetric(waiting, "blocked", NOW), false);
    assert.equal(matchesMetric(waiting, "active", NOW), true);
  });

  it("names each of them separately as the biggest risk", () => {
    const blocked = biggestRisk([task({ status: "BLOCKED" })], NOW);
    const waiting = biggestRisk(
      [task({ status: "WAITING_CLIENT" }), task({ status: "WAITING_CLIENT" })],
      NOW,
    );

    assert.match(blocked?.detail ?? "", /blocked/);
    assert.match(waiting?.headline ?? "", /client/i);
    assert.match(waiting?.detail ?? "", /2 tasks/);
  });
});

describe("the biggest delivery risk", () => {
  it("says nothing when there is nothing wrong", () => {
    assert.equal(biggestRisk([task({ status: "TODO" })], NOW), null);
  });

  it("puts blocked work above late work, because it cannot move at all", () => {
    const risk = biggestRisk(
      [
        task({ status: "BLOCKED", projectName: "CRM & Automation Setup" }),
        task({ dueDate: days(-9), priority: "HIGH" }),
      ],
      NOW,
    );

    assert.equal(risk?.headline, "CRM & Automation Setup");
    assert.equal(risk?.filter, "blocked");
  });

  it("names the project carrying the most blocked work", () => {
    const risk = biggestRisk(
      [
        task({ status: "BLOCKED", projectName: "Funnel Build" }),
        task({ status: "BLOCKED", projectName: "CRM & Automation Setup" }),
        task({ status: "BLOCKED", projectName: "CRM & Automation Setup" }),
      ],
      NOW,
    );

    assert.equal(risk?.headline, "CRM & Automation Setup");
    assert.equal(risk?.detail, "2 blocked tasks");
  });

  it("raises late high-priority work before a long tail of late work", () => {
    const risk = biggestRisk([task({ dueDate: days(-4), priority: "HIGH" })], NOW);

    assert.match(risk?.headline ?? "", /High priority/);
    assert.equal(risk?.filter, "overdue");
  });

  it("points at work that can be checked, never at a mood", () => {
    const risk = biggestRisk([task({ status: "BLOCKED" })], NOW);

    // Every risk names a card, so the claim can be opened and counted.
    assert.ok(risk);
    assert.ok(["blocked", "overdue", "needsReview", "active"].includes(risk.filter));
  });
});

describe("the oldest overdue task", () => {
  it("finds nothing when nothing is late", () => {
    assert.equal(oldestOverdue([task({ dueDate: days(3) })], NOW), null);
  });

  it("picks the one that has been late longest", () => {
    const worst = oldestOverdue(
      [
        task({ title: "Configure Meta lead tracking", dueDate: days(-2) }),
        task({ title: "Review intake form answers", dueDate: days(-6) }),
      ],
      NOW,
    );

    assert.equal(worst?.title, "Review intake form answers");
    assert.equal(worst?.days, 6);
  });
});

/**
 * The EOD column.
 *
 * Only work actually in progress is asked for an update. Nagging about a task
 * sitting in the backlog, or one already handed to a reviewer, teaches people
 * to ignore the column.
 */
describe("the end-of-day column", () => {
  it("asks nothing of work that is not in progress", () => {
    for (const status of ["TODO", "BACKLOG", "WAITING_CLIENT", "NEEDS_REVIEW", "DONE"]) {
      assert.equal(eodState(task({ status }), NOW), "none", `${status} should not be nagged`);
    }
  });

  it("is satisfied by an update filed today", () => {
    assert.equal(eodState(task({ latestEodDate: days(0) }), NOW), "submitted");
  });

  it("expects one when yesterday was the last", () => {
    assert.equal(eodState(task({ latestEodDate: days(-1) }), NOW), "expected");
  });

  it("calls it overdue once more than a day has gone by", () => {
    assert.equal(eodState(task({ latestEodDate: days(-4) }), NOW), "overdue");
  });

  it("does not call work picked up today overdue", () => {
    assert.equal(eodState(task({ startDate: days(0), latestEodDate: null }), NOW), "expected");
  });
});

describe("the team on the account", () => {
  it("counts only open work, so finished tasks do not inflate a load", () => {
    const team = teamOnAccount(
      [
        task({ status: "IN_PROGRESS" }),
        task({ status: "DONE", completedAt: days(-1) }),
      ],
      NOW,
    );

    assert.equal(team.length, 1);
    assert.equal(team[0].open, 1);
  });

  it("puts whoever is carrying the most trouble first", () => {
    const team = teamOnAccount(
      [
        task({ assignee: { id: "a", name: "Alyssa", role: null }, status: "TODO" }),
        task({ assignee: { id: "b", name: "Chris", role: null }, dueDate: days(-3) }),
      ],
      NOW,
    );

    assert.equal(team[0].name, "Chris");
    assert.equal(team[0].overdue, 1);
  });

  it("leaves out work nobody is assigned", () => {
    assert.deepEqual(teamOnAccount([task({ assignee: null })], NOW), []);
  });
});

describe("work health", () => {
  it("reads healthy when the work is moving", () => {
    assert.equal(workHealth([task({ status: "IN_PROGRESS" })], NOW), "HEALTHY");
  });

  it("reads blocked the moment anything is blocked", () => {
    assert.equal(workHealth([task({ status: "BLOCKED" })], NOW), "BLOCKED");
  });

  it("reads at risk when important work is late", () => {
    assert.equal(workHealth([task({ dueDate: days(-1), priority: "HIGH" })], NOW), "AT_RISK");
  });

  it("does not panic over a single late low-priority task", () => {
    assert.equal(workHealth([task({ dueDate: days(-1), priority: "LOW" })], NOW), "HEALTHY");
  });
});
