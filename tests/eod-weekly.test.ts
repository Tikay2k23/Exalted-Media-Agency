import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requiresEodOn } from "@/lib/eod/eod-rules";
import { compileWeek, reportProgress } from "@/lib/eod/weekly-compile";
import {
  complianceFor,
  needsAttention,
  progressTrail,
  startOfWeek,
  summariseMembers,
  summariseWeek,
  tasksRequiringEod,
  type WeekEod,
  type WeekTask,
} from "@/lib/eod/weekly-view";

/** A Wednesday, so the week has days either side of it. */
const NOW = new Date(2026, 7, 12, 17, 0, 0);
const WEEK = startOfWeek(NOW);

const ADA = "user-ada";
const SAM = "user-sam";

function task(overrides: Partial<WeekTask> = {}): WeekTask {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Build the automation",
    status: "IN_PROGRESS",
    startDate: null,
    dueDate: "2026-08-14T09:00:00",
    completedAt: null,
    archivedAt: null,
    blocker: null,
    estimatedHours: 4,
    assignedTo: { id: ADA, name: "Ada", teamRole: "AUTOMATION_SPECIALIST" },
    client: { id: "client-1", companyName: "Metro South Chamber" },
    ...overrides,
  };
}

function entry(overrides: Partial<WeekEod> = {}): WeekEod {
  return {
    id: Math.random().toString(36).slice(2),
    taskId: "task-1",
    authorId: ADA,
    authorName: "Ada",
    entryDate: "2026-08-12T00:00:00",
    summary: "Wired the lead routing.",
    nextSteps: "Run the end to end test.",
    blockers: null,
    progressPercent: 75,
    hoursSpent: 2,
    workLink: null,
    taskStatus: "IN_PROGRESS",
    createdAt: "2026-08-12T17:03:00",
    updatedAt: "2026-08-12T17:03:00",
    ...overrides,
  };
}

describe("which tasks owe an entry", () => {
  it("asks for one on work that was actively being done", () => {
    for (const status of ["IN_PROGRESS", "WAITING_CLIENT", "BLOCKED", "REVISION_REQUIRED"] as const) {
      assert.equal(
        requiresEodOn(
          { id: "t", status, startDate: null, dueDate: NOW, archivedAt: null },
          NOW,
        ),
        true,
        status,
      );
    }
  });

  it("never asks for one on work that is over or not started", () => {
    // Requiring an entry on everything in the database trains people to write
    // "no update" forty times a week, and then the entries stop meaning
    // anything.
    for (const status of ["BACKLOG", "APPROVED", "DONE", "CANCELLED"] as const) {
      assert.equal(
        requiresEodOn(
          { id: "t", status, startDate: null, dueDate: NOW, archivedAt: null },
          NOW,
        ),
        false,
        status,
      );
    }
  });

  it("asks a to-do task only once its start date has arrived", () => {
    const base = { id: "t", status: "TODO" as const, dueDate: NOW, archivedAt: null };

    assert.equal(requiresEodOn({ ...base, startDate: null }, NOW), false);
    assert.equal(
      requiresEodOn({ ...base, startDate: new Date(2026, 7, 20) }, NOW),
      false,
      "not due to start yet",
    );
    assert.equal(
      requiresEodOn({ ...base, startDate: new Date(2026, 7, 10) }, NOW),
      true,
      "was supposed to have started",
    );
  });

  it("does not chase the assignee for work already handed over", () => {
    // Needs review is the reviewer's move. Asking the person who submitted it
    // to report on waiting is asking them to report on somebody else.
    assert.equal(
      requiresEodOn(
        { id: "t", status: "NEEDS_REVIEW", startDate: null, dueDate: NOW, archivedAt: null },
        NOW,
      ),
      false,
    );
  });

  it("ignores archived work entirely", () => {
    assert.equal(
      requiresEodOn(
        {
          id: "t",
          status: "IN_PROGRESS",
          startDate: null,
          dueDate: NOW,
          archivedAt: new Date(2026, 7, 1),
        },
        NOW,
      ),
      false,
    );
  });
});

describe("per-person summaries", () => {
  const members = [
    { id: ADA, name: "Ada", teamRole: "AUTOMATION_SPECIALIST" },
    { id: SAM, name: "Sam", teamRole: "CREATIVE_SPECIALIST" },
  ];

  it("counts what each person owes and filed today", () => {
    const tasks = [
      task({ id: "a1" }),
      task({ id: "a2" }),
      task({ id: "s1", assignedTo: { id: SAM, name: "Sam", teamRole: "CREATIVE_SPECIALIST" } }),
    ];

    const entries = [entry({ taskId: "a1" })];
    const [ada, sam] = summariseMembers(tasks, entries, members, NOW);

    assert.equal(ada.requiredToday, 2);
    assert.equal(ada.submittedToday, 1);
    assert.equal(ada.missingToday, 1);
    assert.equal(ada.state, "Missing EOD");

    assert.equal(sam.requiredToday, 1);
    assert.equal(sam.submittedToday, 0);
  });

  it("says nothing due rather than marking an empty day complete", () => {
    // A green tick on somebody with no work would hide the fact that they have
    // no work, which is the more interesting problem.
    const [ada] = summariseMembers([], [], members, NOW);

    assert.equal(ada.requiredToday, 0);
    assert.equal(ada.state, "Nothing Due");
  });

  it("marks somebody complete once everything owed is in", () => {
    const tasks = [task({ id: "a1" })];
    const [ada] = summariseMembers(tasks, [entry({ taskId: "a1" })], members, NOW);

    assert.equal(ada.state, "EOD Complete");
  });

  it("raises a blocker even when every entry is filed", () => {
    const tasks = [task({ id: "a1", status: "BLOCKED", blocker: "No access" })];
    const [ada] = summariseMembers(tasks, [entry({ taskId: "a1" })], members, NOW);

    assert.equal(ada.blockedTasks, 1);
    assert.equal(ada.state, "Has Blocker");
  });

  it("does not credit yesterday's entry against today", () => {
    const tasks = [task({ id: "a1" })];
    const stale = [entry({ taskId: "a1", entryDate: "2026-08-11T00:00:00" })];

    const [ada] = summariseMembers(tasks, stale, members, NOW);

    assert.equal(ada.submittedToday, 0);
    assert.equal(ada.missingToday, 1);
  });
});

describe("the two compliance figures", () => {
  const members = [
    { id: ADA, name: "Ada", teamRole: null },
    { id: SAM, name: "Sam", teamRole: null },
  ];

  it("keeps task compliance and person compliance apart", () => {
    // Ada owes two and has filed one. Sam owes one and has filed it.
    // Tasks: two of three. People: one of two. Reading either as the other
    // sends a manager to the wrong person.
    const tasks = [
      task({ id: "a1" }),
      task({ id: "a2" }),
      task({ id: "s1", assignedTo: { id: SAM, name: "Sam", teamRole: null } }),
    ];

    const entries = [
      entry({ taskId: "a1" }),
      entry({ taskId: "s1", authorId: SAM, authorName: "Sam" }),
    ];

    const compliance = complianceFor(summariseMembers(tasks, entries, members, NOW));

    assert.equal(compliance.tasksRequired, 3);
    assert.equal(compliance.tasksSubmitted, 2);
    assert.equal(compliance.taskPercent, 67);
    assert.equal(compliance.membersExpected, 2);
    assert.equal(compliance.membersComplete, 1);
  });

  it("leaves people who owe nothing out of the denominator", () => {
    // Counting somebody with no work as incomplete would make a quiet week look
    // like a compliance failure.
    const tasks = [task({ id: "a1" })];
    const compliance = complianceFor(
      summariseMembers(tasks, [entry({ taskId: "a1" })], members, NOW),
    );

    assert.equal(compliance.membersExpected, 1);
    assert.equal(compliance.membersComplete, 1);
  });

  it("reads an empty day as complete rather than as a division by zero", () => {
    const compliance = complianceFor(summariseMembers([], [], members, NOW));

    assert.equal(compliance.taskPercent, 100);
    assert.equal(compliance.membersExpected, 0);
  });
});

describe("the week's headline numbers", () => {
  it("counts only work finished inside the week as completed", () => {
    const members = [{ id: ADA, name: "Ada", teamRole: null }];
    const tasks = [
      task({ status: "DONE", completedAt: "2026-08-11T09:00:00" }),
      task({ status: "DONE", completedAt: "2026-07-30T09:00:00" }),
      task({ id: "live" }),
    ];

    const summary = summariseWeek(tasks, summariseMembers(tasks, [], members, NOW), WEEK);

    assert.equal(summary.completed, 1);
    assert.equal(summary.totalTasks, 3);
  });

  it("counts blocked work", () => {
    const members = [{ id: ADA, name: "Ada", teamRole: null }];
    const tasks = [task({ status: "BLOCKED", blocker: "No access" }), task()];

    const summary = summariseWeek(tasks, summariseMembers(tasks, [], members, NOW), WEEK);

    assert.equal(summary.blocked, 1);
  });
});

describe("what a manager needs to chase", () => {
  it("shows a missing entry and puts blockers first", () => {
    const tasks = [
      task({ id: "missing" }),
      task({ id: "stuck", status: "BLOCKED", blocker: "Waiting for GHL access" }),
    ];

    const rows = needsAttention(tasks, [], NOW);

    assert.equal(rows[0].kind, "blocked");
    assert.equal(rows[0].detail, "Waiting for GHL access");
    assert.ok(rows.some((row) => row.kind === "silent"));
  });

  it("separates nothing today from nothing all week", () => {
    // A slip and an abandoned task are different problems and want different
    // conversations.
    const tasks = [task({ id: "a1" })];
    const yesterday = [entry({ taskId: "a1", entryDate: "2026-08-11T00:00:00" })];

    assert.equal(needsAttention(tasks, yesterday, NOW)[0].kind, "missing");
    assert.equal(needsAttention(tasks, [], NOW)[0].kind, "silent");
  });

  it("stays empty when everything is accounted for", () => {
    // The value of this panel is that being empty is good news.
    const tasks = [task({ id: "a1" })];

    assert.deepEqual(needsAttention(tasks, [entry({ taskId: "a1" })], NOW), []);
  });

  it("says so when a blocker has no reason recorded", () => {
    const rows = needsAttention([task({ id: "a1", status: "BLOCKED" })], [], NOW);

    assert.match(rows[0].detail, /no reason recorded/i);
  });
});

describe("the progress trail", () => {
  it("reads in the order the work happened", () => {
    const entries = [
      entry({ taskId: "a1", entryDate: "2026-08-12T00:00:00", progressPercent: 75 }),
      entry({ taskId: "a1", entryDate: "2026-08-10T00:00:00", progressPercent: 30 }),
      entry({ taskId: "a1", entryDate: "2026-08-11T00:00:00", progressPercent: 55 }),
      entry({ taskId: "other", entryDate: "2026-08-11T00:00:00", progressPercent: 90 }),
    ];

    assert.deepEqual(
      progressTrail(entries, "a1").map((point) => point.percent),
      [30, 55, 75],
    );
  });

  it("leaves out entries that recorded no progress", () => {
    const entries = [entry({ taskId: "a1", progressPercent: null })];

    assert.deepEqual(progressTrail(entries, "a1"), []);
  });
});

describe("compiling the week from its entries", () => {
  it("groups by task and totals the hours", () => {
    const tasks = [task({ id: "a1", title: "Lead routing" })];
    const entries = [
      entry({ taskId: "a1", entryDate: "2026-08-10T00:00:00", hoursSpent: 2, progressPercent: 30 }),
      entry({ taskId: "a1", entryDate: "2026-08-12T00:00:00", hoursSpent: 1.5, progressPercent: 75 }),
    ];

    const compiled = compileWeek(tasks, entries, WEEK, 4);

    assert.equal(compiled.tasksWorkedOn, 1);
    assert.equal(compiled.totalHours, 3.5);
    assert.equal(compiled.inProgress.length, 1);
    // The latest entry describes where it stands, not the first.
    assert.equal(compiled.inProgress[0].progressPercent, 75);
  });

  it("separates finished, blocked and still going", () => {
    const tasks = [
      task({ id: "done", status: "DONE", completedAt: "2026-08-11T09:00:00" }),
      task({ id: "stuck", status: "BLOCKED", blocker: "No access" }),
      task({ id: "live" }),
    ];

    const entries = [
      entry({ taskId: "done" }),
      entry({ taskId: "stuck", blockers: "No access" }),
      entry({ taskId: "live" }),
    ];

    const compiled = compileWeek(tasks, entries, WEEK, 3);

    assert.equal(compiled.completed.length, 1);
    assert.equal(compiled.blocked.length, 1);
    assert.equal(compiled.inProgress.length, 1);
  });

  it("carries next steps forward only from work still going", () => {
    // A finished task's next step is not next week's problem.
    const tasks = [
      task({ id: "done", status: "DONE", completedAt: "2026-08-11T09:00:00" }),
      task({ id: "live", title: "Warm up sequence" }),
    ];

    const entries = [
      entry({ taskId: "done", nextSteps: "Nothing" }),
      entry({ taskId: "live", nextSteps: "Finish the last SMS" }),
    ];

    const compiled = compileWeek(tasks, entries, WEEK, 2);

    assert.equal(compiled.nextSteps.length, 1);
    assert.match(compiled.nextSteps[0], /Warm up sequence: Finish the last SMS/);
  });

  it("reports compliance as a share of what was owed", () => {
    const tasks = [task({ id: "a1" })];

    assert.equal(compileWeek(tasks, [entry({ taskId: "a1" })], WEEK, 4).eodCompliance, 25);
    // Absent rather than zero when nothing was owed - there is no denominator.
    assert.equal(compileWeek(tasks, [], WEEK, 0).eodCompliance, null);
  });

  it("compiles to an empty week rather than throwing when nobody wrote anything", () => {
    const compiled = compileWeek([], [], WEEK, 0);

    assert.equal(compiled.tasksWorkedOn, 0);
    assert.equal(compiled.totalHours, 0);
    assert.deepEqual(compiled.completed, []);
    assert.deepEqual(compiled.nextSteps, []);
  });

  it("ignores entries on tasks outside this person's set", () => {
    const compiled = compileWeek([task({ id: "mine" })], [entry({ taskId: "theirs" })], WEEK, 1);

    assert.equal(compiled.tasksWorkedOn, 0);
  });
});

describe("who has filed their week", () => {
  it("counts everyone without a row as not started", () => {
    const progress = reportProgress(
      [{ status: "SUBMITTED" }, { status: "APPROVED" }, { status: "DRAFT" }],
      6,
    );

    assert.equal(progress.submitted, 1);
    assert.equal(progress.approved, 1);
    assert.equal(progress.draft, 1);
    assert.equal(progress.notStarted, 3);
    assert.equal(progress.expected, 6);
  });

  it("never reports a negative not-started count", () => {
    const progress = reportProgress([{ status: "SUBMITTED" }, { status: "SUBMITTED" }], 1);

    assert.equal(progress.submitted, 2);
    assert.ok(progress.notStarted <= 0);
  });
});

describe("which tasks appear on the day", () => {
  it("returns only the ones that owed an entry", () => {
    const tasks = [
      task({ id: "live" }),
      task({ id: "backlog", status: "BACKLOG" }),
      task({ id: "done", status: "DONE" }),
    ];

    assert.deepEqual(
      tasksRequiringEod(tasks, NOW).map((row) => row.id),
      ["live"],
    );
  });
});
