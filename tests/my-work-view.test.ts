import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TaskRow } from "@/components/work/task-types";
import {
  deriveDashboard,
  deriveMyWork,
  onTimeRate,
  myClients,
  needsMyAttention,
  startOfWeek,
  summariseMyWork,
  tasksAssignedTo,
  todaysFocus,
  waitingAndBlocked,
  weekMetrics,
  workloadThisWeek,
} from "@/lib/tasks/my-work-view";

/** A Wednesday, so the week has days either side of it. */
const NOW = new Date(2026, 7, 12, 10, 0, 0);
const ME = "user-me";
const OTHER = "user-other";

function task(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Build the landing page",
    status: "TODO",
    priority: "MEDIUM",
    category: "FUNNELS_AND_LANDING_PAGES",
    platform: null,
    recurrence: "NONE",
    dueDate: "2026-08-20T09:00:00",
    startDate: null,
    createdAt: "2026-08-01T09:00:00",
    updatedAt: "2026-08-11T09:00:00",
    submittedAt: null,
    completedAt: null,
    approvedAt: null,
    archivedAt: null,
    estimatedHours: 2,
    actualHours: null,
    requiresApproval: false,
    objective: null,
    completionCriteria: null,
    note: null,
    kpi: null,
    blocker: null,
    requiredAssets: null,
    revisionNote: null,
    evidenceUrl: null,
    client: { id: "client-1", companyName: "Best Life Chiropractic" },
    project: { id: "project-1", name: "Website Redesign" },
    assignedTo: { id: ME, name: "Me" },
    createdBy: { id: OTHER, name: "Owner Account" },
    reviewer: null,
    approvedBy: null,
    commentCount: 0,
    ...overrides,
  };
}

describe("scoping the overview to one person", () => {
  it("counts only the work assigned to them, not everything they can see", () => {
    // A project manager sees the whole agency in the table below. "Am I behind"
    // is still a question about their own plate.
    const rows = [
      task({ assignedTo: { id: ME, name: "Me" } }),
      task({ assignedTo: { id: OTHER, name: "Someone else" } }),
      task({ assignedTo: null }),
    ];

    assert.equal(tasksAssignedTo(rows, ME).length, 1);
  });
});

describe("the six summary cards", () => {
  it("keeps due today, due soon and overdue exclusive", () => {
    const rows = [
      task({ dueDate: "2026-08-09T09:00:00" }),
      task({ dueDate: "2026-08-12T15:00:00" }),
      task({ dueDate: "2026-08-14T09:00:00" }),
      task({ dueDate: "2026-09-30T09:00:00" }),
    ];

    const summary = summariseMyWork(rows, NOW);

    assert.equal(summary.overdue, 1);
    assert.equal(summary.dueToday, 1);
    assert.equal(summary.dueSoon, 1);
  });

  it("counts what is parked and what is waiting on a decision", () => {
    const rows = [
      task({ status: "WAITING_CLIENT" }),
      task({ status: "WAITING_CLIENT" }),
      task({ status: "NEEDS_REVIEW" }),
    ];

    const summary = summariseMyWork(rows, NOW);

    assert.equal(summary.waitingOnClient, 2);
    assert.equal(summary.needsReview, 1);
  });

  it("counts this week's completions from Monday, not the last seven days", () => {
    const monday = startOfWeek(NOW);
    assert.equal(monday.getDay(), 1);
    assert.equal(monday.getDate(), 10);

    const rows = [
      task({ status: "DONE", completedAt: "2026-08-10T09:00:00" }),
      task({ status: "APPROVED", completedAt: "2026-08-12T09:00:00" }),
      // Sunday, the week before. Within seven days, but not this week.
      task({ status: "DONE", completedAt: "2026-08-09T09:00:00" }),
    ];

    assert.equal(summariseMyWork(rows, NOW).completedThisWeek, 2);
  });

  it("leaves archived and finished work out of what is still owed", () => {
    const rows = [
      task({ dueDate: "2026-08-01T09:00:00", archivedAt: "2026-08-05T09:00:00" }),
      task({ status: "DONE", dueDate: "2026-08-01T09:00:00" }),
      task({ status: "CANCELLED", dueDate: "2026-08-01T09:00:00" }),
    ];

    assert.equal(summariseMyWork(rows, NOW).overdue, 0);
  });
});

describe("Today's Focus", () => {
  it("ranks overdue, then sent back, then due today, then started", () => {
    const rows = [
      task({ id: "upcoming", dueDate: "2026-09-01T09:00:00" }),
      task({ id: "started", status: "IN_PROGRESS", dueDate: "2026-08-25T09:00:00" }),
      task({ id: "today", dueDate: "2026-08-12T09:00:00" }),
      task({ id: "revision", status: "REVISION_REQUIRED", dueDate: "2026-08-30T09:00:00" }),
      task({ id: "late", dueDate: "2026-08-05T09:00:00" }),
    ];

    const focus = todaysFocus(rows, NOW);

    assert.deepEqual(
      focus.map((item) => item.task.id),
      ["late", "revision", "today", "started", "upcoming"],
    );
  });

  it("leaves out work that cannot move", () => {
    // Telling somebody to focus on a task they are blocked on is bad advice.
    // Waiting and Blocked is the section for those.
    const rows = [
      task({ id: "blocked", status: "BLOCKED", dueDate: "2026-08-01T09:00:00" }),
      task({ id: "waiting", status: "WAITING_CLIENT", dueDate: "2026-08-01T09:00:00" }),
      task({ id: "live", dueDate: "2026-08-13T09:00:00" }),
    ];

    assert.deepEqual(todaysFocus(rows, NOW).map((item) => item.task.id), ["live"]);
  });

  it("shows at most five, and nothing when the plate is clear", () => {
    const rows = Array.from({ length: 9 }, (_, index) =>
      task({ dueDate: `2026-08-${String(13 + index).padStart(2, "0")}T09:00:00` }),
    );

    assert.equal(todaysFocus(rows, NOW).length, 5);
    assert.deepEqual(todaysFocus([], NOW), []);
    assert.deepEqual(todaysFocus([task({ status: "DONE" })], NOW), []);
  });

  it("labels the action with what the person would actually do next", () => {
    assert.equal(todaysFocus([task({ status: "TODO" })], NOW)[0].action, "Start Task");
    assert.equal(todaysFocus([task({ status: "IN_PROGRESS" })], NOW)[0].action, "Open Task");
    assert.equal(
      todaysFocus([task({ status: "REVISION_REQUIRED" })], NOW)[0].action,
      "View Feedback",
    );
  });

  it("brings urgent work forward once it is close", () => {
    const rows = [
      task({ id: "soon-low", priority: "LOW", dueDate: "2026-08-14T09:00:00" }),
      task({ id: "soon-urgent", priority: "URGENT", dueDate: "2026-08-14T09:00:00" }),
    ];

    assert.equal(todaysFocus(rows, NOW)[0].task.id, "soon-urgent");
  });
});

describe("Waiting and Blocked", () => {
  it("shows only work that cannot proceed, with the reason recorded", () => {
    const rows = [
      task({ status: "BLOCKED", blocker: "No GoHighLevel access yet." }),
      task({ status: "WAITING_CLIENT" }),
      task({ status: "IN_PROGRESS" }),
    ];

    const waiting = waitingAndBlocked(rows);

    assert.equal(waiting.length, 2);
    assert.equal(waiting[0].reason, "No GoHighLevel access yet.");
  });

  it("says so plainly when a blocker has no reason on it", () => {
    // A card parked with no reason is one nobody chases. Saying that is more
    // useful than leaving the line blank.
    const waiting = waitingAndBlocked([task({ status: "BLOCKED" })]);

    assert.match(waiting[0].reason, /no reason recorded/i);
  });

  it("puts the longest wait first", () => {
    const rows = [
      task({ id: "recent", status: "BLOCKED", updatedAt: "2026-08-11T09:00:00" }),
      task({ id: "stale", status: "BLOCKED", updatedAt: "2026-08-02T09:00:00" }),
    ];

    assert.equal(waitingAndBlocked(rows)[0].task.id, "stale");
  });

  it("ignores archived work", () => {
    assert.deepEqual(
      waitingAndBlocked([task({ status: "BLOCKED", archivedAt: "2026-08-01T09:00:00" })]),
      [],
    );
  });
});

describe("Needs My Attention", () => {
  it("puts a revision request above everything else", () => {
    const rows = [
      task({ id: "late", dueDate: "2026-08-01T09:00:00" }),
      task({
        id: "sent-back",
        status: "REVISION_REQUIRED",
        revisionNote: "The form is not wired up.",
      }),
    ];

    const items = needsMyAttention(rows, ME, NOW);

    assert.equal(items[0].kind, "revision");
    assert.equal(items[0].detail, "The form is not wired up.");
  });

  it("surfaces work waiting on this person's review", () => {
    // Somebody else did it, so it is not on their own list - but it is still
    // stopping them.
    const rows = [
      task({
        id: "to-review",
        status: "NEEDS_REVIEW",
        assignedTo: { id: OTHER, name: "Creative" },
        reviewer: { id: ME, name: "Me" },
      }),
    ];

    const items = needsMyAttention(rows, ME, NOW);

    assert.equal(items.length, 1);
    assert.equal(items[0].kind, "review");
    assert.equal(items[0].action, "Review");
  });

  it("does not ask somebody to review their own work", () => {
    const rows = [
      task({
        status: "NEEDS_REVIEW",
        assignedTo: { id: ME, name: "Me" },
        reviewer: { id: ME, name: "Me" },
      }),
    ];

    assert.equal(
      needsMyAttention(rows, ME, NOW).some((item) => item.kind === "review"),
      false,
    );
  });

  it("raises one item per task rather than three", () => {
    // An overdue task that was also sent back is one problem, not two.
    const rows = [
      task({ status: "REVISION_REQUIRED", revisionNote: "Fix it", dueDate: "2026-08-01T09:00:00" }),
    ];

    assert.equal(needsMyAttention(rows, ME, NOW).length, 1);
  });

  it("stays quiet when there is nothing to act on", () => {
    assert.deepEqual(needsMyAttention([task({ dueDate: "2026-09-30T09:00:00" })], ME, NOW), []);
  });
});

describe("My Clients", () => {
  it("groups the work by account and counts what is parked", () => {
    const rows = [
      task({ status: "IN_PROGRESS" }),
      task({ status: "WAITING_CLIENT" }),
      task({
        status: "NEEDS_REVIEW",
        client: { id: "client-2", companyName: "Metro South Chamber" },
      }),
    ];

    const cards = myClients(rows, NOW);

    assert.equal(cards.length, 2);

    const best = cards.find((card) => card.id === "client-1");
    assert.ok(best);
    assert.equal(best.activeTasks, 2);
    assert.equal(best.waitingOnClient, 1);
  });

  it("keeps internal work visible under its own heading", () => {
    const cards = myClients([task({ client: null })], NOW);

    assert.equal(cards[0].id, null);
    assert.equal(cards[0].name, "Internal / Agency Work");
  });

  it("shows the next thing falling due, not something already late", () => {
    const rows = [
      task({ dueDate: "2026-08-01T09:00:00" }),
      task({ dueDate: "2026-08-18T09:00:00" }),
      task({ dueDate: "2026-08-25T09:00:00" }),
    ];

    const card = myClients(rows, NOW)[0];

    assert.ok(card.nextDue);
    assert.equal(new Date(card.nextDue).getDate(), 18);
  });

  it("puts the busiest account first", () => {
    const rows = [
      task({ client: { id: "quiet", companyName: "Quiet Co" } }),
      task({ client: { id: "busy", companyName: "Busy Co" } }),
      task({ client: { id: "busy", companyName: "Busy Co" } }),
    ];

    assert.equal(myClients(rows, NOW)[0].id, "busy");
  });
});

describe("This Week", () => {
  it("counts only this week's completions but all live work in progress", () => {
    const rows = [
      task({ status: "DONE", completedAt: "2026-08-11T09:00:00", estimatedHours: 3, actualHours: 5 }),
      task({ status: "DONE", completedAt: "2026-07-11T09:00:00", estimatedHours: 8, actualHours: 9 }),
      task({ status: "IN_PROGRESS", estimatedHours: 2, actualHours: 1 }),
      task({ status: "NEEDS_REVIEW" }),
    ];

    const week = weekMetrics(rows, NOW);

    assert.equal(week.completed, 1);
    assert.equal(week.inProgress, 1);
    assert.equal(week.needsReview, 1);
    // Last month's task contributes nothing to either hours figure.
    assert.equal(week.estimatedHours, 5);
    assert.equal(week.actualHours, 6);
  });

  it("reports zero actual hours rather than breaking when none were recorded", () => {
    const week = weekMetrics([task({ status: "IN_PROGRESS", actualHours: null })], NOW);

    assert.equal(week.actualHours, 0);
  });
});

describe("the whole overview together", () => {
  it("agrees with itself about one person's work", () => {
    const rows = [
      task({ id: "a", dueDate: "2026-08-01T09:00:00" }),
      task({ id: "b", status: "BLOCKED", blocker: "No access" }),
      task({ id: "c", assignedTo: { id: OTHER, name: "Someone else" } }),
    ];

    const view = deriveMyWork(rows, ME, NOW);

    assert.equal(view.summary.overdue, 1);
    assert.equal(view.waiting.length, 1);
    // Somebody else's task appears nowhere in this person's overview.
    assert.ok(view.focus.every((item) => item.task.id !== "c"));
    assert.ok(view.clients.every((card) => card.activeTasks <= 2));
  });

  it("returns empty sections rather than throwing for somebody with no work", () => {
    const view = deriveMyWork([], ME, NOW);

    assert.deepEqual(view.focus, []);
    assert.deepEqual(view.waiting, []);
    assert.deepEqual(view.attention, []);
    assert.deepEqual(view.clients, []);
    assert.equal(view.summary.dueToday, 0);
    assert.equal(view.week.actualHours, 0);
  });
});

describe("on time rate", () => {
  it("counts a task finished on its due date as on time", () => {
    // Finishing at six in the evening on the due date is on time, and anybody
    // would say so. Comparing timestamps rather than days would call it late.
    const rows = [
      task({
        status: "DONE",
        dueDate: "2026-08-11T09:00:00",
        completedAt: "2026-08-11T18:00:00",
      }),
    ];

    assert.equal(onTimeRate(rows, NOW), 100);
  });

  it("works out the percentage across the week", () => {
    const rows = [
      task({ status: "DONE", dueDate: "2026-08-11T09:00:00", completedAt: "2026-08-11T09:00:00" }),
      task({ status: "DONE", dueDate: "2026-08-10T09:00:00", completedAt: "2026-08-10T09:00:00" }),
      task({ status: "DONE", dueDate: "2026-08-10T09:00:00", completedAt: "2026-08-12T09:00:00" }),
      task({ status: "DONE", dueDate: "2026-08-11T09:00:00", completedAt: "2026-08-12T09:00:00" }),
    ];

    assert.equal(onTimeRate(rows, NOW), 50);
  });

  it("is absent rather than perfect when nothing has finished", () => {
    // A rate with no denominator is not a good score. Showing 100% would
    // flatter a week that has not started.
    assert.equal(onTimeRate([], NOW), null);
    assert.equal(onTimeRate([task({ status: "IN_PROGRESS" })], NOW), null);
  });

  it("ignores work finished before this week", () => {
    const rows = [
      task({ status: "DONE", dueDate: "2026-07-01T09:00:00", completedAt: "2026-07-30T09:00:00" }),
    ];

    assert.equal(onTimeRate(rows, NOW), null);
  });
});

describe("workload this week", () => {
  it("books estimated hours on live work and actual hours on finished work", () => {
    const rows = [
      task({ status: "IN_PROGRESS", estimatedHours: 6, actualHours: null }),
      task({
        status: "DONE",
        estimatedHours: 4,
        actualHours: 5,
        completedAt: "2026-08-11T09:00:00",
      }),
    ];

    assert.equal(workloadThisWeek(rows, NOW, 40).bookedHours, 11);
  });

  it("uses the person's own capacity rather than a constant", () => {
    // A part-time seat measured against forty hours always looks healthy.
    const rows = [task({ status: "IN_PROGRESS", estimatedHours: 16 })];

    assert.equal(workloadThisWeek(rows, NOW, 40).state, "Healthy");
    assert.equal(workloadThisWeek(rows, NOW, 20).state, "Near Capacity");
    assert.equal(workloadThisWeek(rows, NOW, 16).state, "Over Capacity");
  });

  it("bands the state at seventy and ninety percent", () => {
    const at = (hours: number) =>
      workloadThisWeek([task({ status: "IN_PROGRESS", estimatedHours: hours })], NOW, 100).state;

    assert.equal(at(69), "Healthy");
    assert.equal(at(70), "Near Capacity");
    assert.equal(at(90), "Near Capacity");
    assert.equal(at(91), "Over Capacity");
  });

  it("never reports negative hours available", () => {
    const workload = workloadThisWeek(
      [task({ status: "IN_PROGRESS", estimatedHours: 60 })],
      NOW,
      40,
    );

    assert.equal(workload.availableHours, 0);
    assert.equal(workload.percentUsed, 150);
  });

  it("falls back to the column default when no capacity is set", () => {
    // Zero would divide by nothing and render NaN%.
    const workload = workloadThisWeek(
      [task({ status: "IN_PROGRESS", estimatedHours: 20 })],
      NOW,
      0,
    );

    assert.equal(workload.capacityHours, 40);
    assert.equal(workload.percentUsed, 50);
  });

  it("leaves archived work out of the booking", () => {
    const rows = [
      task({ status: "IN_PROGRESS", estimatedHours: 8, archivedAt: "2026-08-01T09:00:00" }),
    ];

    assert.equal(workloadThisWeek(rows, NOW, 40).bookedHours, 0);
  });
});

describe("client state", () => {
  it("calls an account at risk when its work is overdue or blocked", () => {
    assert.equal(myClients([task({ dueDate: "2026-08-01T09:00:00" })], NOW)[0].state, "At Risk");
    assert.equal(myClients([task({ status: "BLOCKED" })], NOW)[0].state, "At Risk");
  });

  it("calls it waiting when the hold-up is the client's", () => {
    assert.equal(myClients([task({ status: "WAITING_CLIENT" })], NOW)[0].state, "Waiting");
  });

  it("puts risk above waiting, because risk is the thing to act on", () => {
    const rows = [
      task({ status: "WAITING_CLIENT" }),
      task({ dueDate: "2026-08-01T09:00:00" }),
    ];

    assert.equal(myClients(rows, NOW)[0].state, "At Risk");
  });

  it("calls it on track otherwise", () => {
    assert.equal(myClients([task({ dueDate: "2026-09-01T09:00:00" })], NOW)[0].state, "On Track");
  });
});

describe("priority alerts", () => {
  it("raises waiting-for-client as its own alert", () => {
    const items = needsMyAttention([task({ status: "WAITING_CLIENT" })], ME, NOW);

    assert.equal(items[0].kind, "waiting");
    assert.equal(items[0].action, "View Task");
  });

  it("raises a comment somebody else left", () => {
    const items = needsMyAttention([], ME, NOW, 6, [
      {
        id: "c1",
        taskId: "t1",
        taskTitle: "Landing page",
        authorName: "Owner Account",
        body: "Can you check the form?",
        createdAt: "2026-08-12T09:00:00",
      },
    ]);

    assert.equal(items.length, 1);
    assert.equal(items[0].kind, "comment");
    assert.match(items[0].title, /Owner Account/);
  });

  it("ranks a revision above a comment above something merely due", () => {
    const rows = [
      task({ id: "due", dueDate: "2026-08-12T09:00:00" }),
      task({ id: "sent-back", status: "REVISION_REQUIRED", revisionNote: "Fix it" }),
    ];

    const items = needsMyAttention(rows, ME, NOW, 6, [
      {
        id: "c1",
        taskId: "t1",
        taskTitle: "Landing page",
        authorName: "Owner",
        body: "Question",
        createdAt: "2026-08-12T09:00:00",
      },
    ]);

    assert.deepEqual(items.map((item) => item.kind), ["revision", "comment", "due-today"]);
  });
});

describe("the dashboard together", () => {
  it("agrees with My Work about the same numbers", () => {
    // The two pages read one derivation. If these ever disagreed, somebody
    // would be told they had three overdue tasks on one screen and one on the
    // other, with no way to tell which was right.
    const rows = [
      task({ id: "a", dueDate: "2026-08-01T09:00:00" }),
      task({ id: "b", status: "IN_PROGRESS", estimatedHours: 5 }),
      task({ id: "c", status: "WAITING_CLIENT" }),
    ];

    const dashboard = deriveDashboard(rows, ME, NOW, 40);
    const work = deriveMyWork(rows, ME, NOW);

    assert.equal(dashboard.summary.overdue, work.summary.overdue);
    assert.equal(dashboard.inProgress, work.week.inProgress);
    assert.deepEqual(dashboard.clients, work.clients);
  });

  it("holds up for somebody with nothing on their plate", () => {
    const view = deriveDashboard([], ME, NOW, 40);

    assert.equal(view.summary.dueToday, 0);
    assert.equal(view.inProgress, 0);
    assert.equal(view.onTimeRate, null);
    assert.equal(view.workload.bookedHours, 0);
    assert.equal(view.workload.availableHours, 40);
    assert.equal(view.workload.state, "Healthy");
    assert.deepEqual(view.attention, []);
    assert.deepEqual(view.clients, []);
  });
});
