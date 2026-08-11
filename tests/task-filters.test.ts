import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EMPTY_FILTERS,
  type FilterableTask,
  applyFilters,
  countByTab,
  hasActiveFilters,
  isTodayFocus,
  matchesSearch,
  parseTaskAssets,
  relativeDue,
  resolveDateRange,
  summarise,
  tabFor,
} from "@/lib/tasks/task-filters";

/** A Wednesday, so "this week" has days either side of it. */
const NOW = new Date(2026, 7, 12, 10, 0, 0);

function task(overrides: Partial<FilterableTask> = {}): FilterableTask {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Build the landing page",
    status: "TODO",
    priority: "MEDIUM",
    category: "FUNNELS_AND_LANDING_PAGES",
    dueDate: "2026-08-20T00:00:00",
    createdAt: "2026-08-01T00:00:00",
    completedAt: null,
    archivedAt: null,
    estimatedHours: 2,
    note: null,
    objective: null,
    completionCriteria: null,
    client: { id: "client-1", companyName: "Best Life Chiropractic" },
    project: { id: "project-1", name: "Website Redesign" },
    assignedTo: { id: "user-1", name: "Ada" },
    createdBy: { id: "user-2", name: "Owner Account" },
    reviewer: { id: "user-2", name: "Owner Account" },
    ...overrides,
  };
}

describe("which tab a task belongs in", () => {
  it("puts working states under active", () => {
    for (const status of ["BACKLOG", "TODO", "IN_PROGRESS", "WAITING_CLIENT", "BLOCKED"] as const) {
      assert.equal(tabFor(task({ status })), "active", status);
    }
  });

  it("separates review from revision", () => {
    assert.equal(tabFor(task({ status: "NEEDS_REVIEW" })), "review");
    assert.equal(tabFor(task({ status: "REVISION_REQUIRED" })), "revision");
  });

  it("puts approved and done under completed", () => {
    assert.equal(tabFor(task({ status: "APPROVED" })), "completed");
    assert.equal(tabFor(task({ status: "DONE" })), "completed");
  });

  it("puts archived work under archived whatever its status", () => {
    // Archiving is the decision that takes something off the board. A task that
    // was in progress when it was archived must not come back under Active.
    assert.equal(
      tabFor(task({ status: "IN_PROGRESS", archivedAt: "2026-08-10T00:00:00" })),
      "archived",
    );
    assert.equal(
      tabFor(task({ status: "DONE", archivedAt: "2026-08-10T00:00:00" })),
      "archived",
    );
  });

  it("keeps archived work out of All", () => {
    const rows = [
      task({ status: "TODO" }),
      task({ status: "DONE", archivedAt: "2026-08-10T00:00:00" }),
    ];

    const counts = countByTab(rows);

    assert.equal(counts.all, 1);
    assert.equal(counts.archived, 1);
    assert.equal(counts.active, 1);
  });
});

describe("the five numbers across the top", () => {
  it("never counts one task as both overdue and due soon", () => {
    // The two cards are read together. A task in both would make them add up to
    // more work than exists.
    const rows = [
      task({ dueDate: "2026-08-01T00:00:00" }),
      task({ dueDate: "2026-08-13T00:00:00" }),
    ];

    const summary = summarise(rows, NOW);

    assert.equal(summary.overdue, 1);
    assert.equal(summary.dueSoon, 1);
  });

  it("counts today as due soon rather than overdue", () => {
    const summary = summarise([task({ dueDate: "2026-08-12T23:00:00" })], NOW);

    assert.equal(summary.overdue, 0);
    assert.equal(summary.dueSoon, 1);
  });

  it("does not chase finished work for being late", () => {
    const rows = [
      task({ status: "DONE", dueDate: "2026-07-01T00:00:00" }),
      task({ status: "APPROVED", dueDate: "2026-07-01T00:00:00" }),
      task({ status: "CANCELLED", dueDate: "2026-07-01T00:00:00" }),
    ];

    assert.equal(summarise(rows, NOW).overdue, 0);
  });

  it("leaves archived work out of everything anybody still has to do", () => {
    const rows = [
      task({ status: "IN_PROGRESS", archivedAt: "2026-08-01T00:00:00" }),
      task({
        status: "NEEDS_REVIEW",
        archivedAt: "2026-08-01T00:00:00",
        dueDate: "2026-07-01T00:00:00",
      }),
    ];

    const summary = summarise(rows, NOW);

    assert.equal(summary.active, 0);
    assert.equal(summary.needsReview, 0);
    assert.equal(summary.overdue, 0);
  });

  it("counts this month's completions, not last month's", () => {
    const rows = [
      task({ status: "DONE", completedAt: "2026-08-03T00:00:00" }),
      task({ status: "APPROVED", completedAt: "2026-08-11T00:00:00" }),
      task({ status: "DONE", completedAt: "2026-07-28T00:00:00" }),
    ];

    assert.equal(summarise(rows, NOW).completedThisMonth, 2);
  });

  it("still counts a completed task that was since archived", () => {
    // It was finished this month. Archiving it afterwards does not un-finish it,
    // and a monthly total that shrinks when somebody tidies up is a lie.
    const rows = [
      task({
        status: "DONE",
        completedAt: "2026-08-05T00:00:00",
        archivedAt: "2026-08-09T00:00:00",
      }),
    ];

    assert.equal(summarise(rows, NOW).completedThisMonth, 1);
  });
});

describe("search", () => {
  const row = task({
    title: "Design 5 Ad Creatives for Meta Ads",
    note: "Use the winter brand kit",
    client: { id: "c", companyName: "Best Life Chiropractic" },
    project: { id: "p", name: "August Meta Ads Campaign" },
    createdBy: { id: "u", name: "Owner Account" },
  });

  it("finds a task by title, client, campaign, category or who assigned it", () => {
    for (const term of [
      "creatives",
      "best life",
      "august meta",
      "creative design",
      "owner",
      "winter brand",
    ]) {
      assert.equal(matchesSearch(row, term), true, term);
    }
  });

  it("narrows rather than widens when somebody types more words", () => {
    // Every word has to appear somewhere. An OR would return more results the
    // more you typed, which is the opposite of what typing more means.
    assert.equal(matchesSearch(row, "meta chiropractic"), true);
    assert.equal(matchesSearch(row, "meta plumbing"), false);
  });

  it("matches internal work on the words somebody would use for it", () => {
    assert.equal(matchesSearch(task({ client: null }), "internal"), true);
  });

  it("matches everything on an empty search", () => {
    assert.equal(matchesSearch(row, "   "), true);
  });
});

describe("date presets", () => {
  it("runs this week from Monday to Sunday", () => {
    const range = resolveDateRange("this-week", NOW);

    assert.ok(range);
    assert.equal(range.from.getDay(), 1);
    assert.equal(range.to.getDay(), 0);
  });

  it("gives today a window that ends tonight", () => {
    const range = resolveDateRange("today", NOW);

    assert.ok(range);
    assert.equal(range.from.getHours(), 0);
    assert.equal(range.to.getHours(), 23);
  });

  it("treats an unfilled custom range as no filter at all", () => {
    assert.equal(resolveDateRange("custom", NOW, { from: "", to: "" }), null);
    assert.equal(resolveDateRange("any", NOW), null);
  });

  it("accepts a custom range with only one end", () => {
    const range = resolveDateRange("custom", NOW, { from: "2026-08-01", to: "" });

    assert.ok(range);
    assert.ok(range.to.getTime() > NOW.getTime());
  });
});

describe("the daily focus view", () => {
  it("shows overdue, due today, in progress and sent back", () => {
    assert.equal(isTodayFocus(task({ dueDate: "2026-08-01T00:00:00" }), NOW), true);
    assert.equal(isTodayFocus(task({ dueDate: "2026-08-12T09:00:00" }), NOW), true);
    assert.equal(
      isTodayFocus(task({ status: "IN_PROGRESS", dueDate: "2026-09-01T00:00:00" }), NOW),
      true,
    );
    assert.equal(
      isTodayFocus(
        task({ status: "REVISION_REQUIRED", dueDate: "2026-09-01T00:00:00" }),
        NOW,
      ),
      true,
    );
  });

  it("leaves out work that is finished or not yet due", () => {
    assert.equal(isTodayFocus(task({ dueDate: "2026-09-01T00:00:00" }), NOW), false);
    assert.equal(
      isTodayFocus(task({ status: "DONE", dueDate: "2026-08-01T00:00:00" }), NOW),
      false,
    );
    assert.equal(
      isTodayFocus(
        task({ status: "IN_PROGRESS", archivedAt: "2026-08-01T00:00:00" }),
        NOW,
      ),
      false,
    );
  });
});

describe("filtering and sorting together", () => {
  const rows = [
    task({ id: "a", priority: "LOW", dueDate: "2026-08-25T00:00:00", estimatedHours: 1 }),
    task({ id: "b", priority: "URGENT", dueDate: "2026-08-14T00:00:00", estimatedHours: 8 }),
    task({ id: "c", priority: "HIGH", dueDate: "2026-08-13T00:00:00", estimatedHours: 4 }),
    task({ id: "d", status: "DONE", dueDate: "2026-08-10T00:00:00", client: null }),
  ];

  it("sorts by due date soonest first by default", () => {
    const result = applyFilters(rows, EMPTY_FILTERS, NOW);
    assert.deepEqual(result.map((row) => row.id), ["d", "c", "b", "a"]);
  });

  it("sorts by priority, breaking ties on the due date", () => {
    const result = applyFilters(rows, { ...EMPTY_FILTERS, sort: "priority-desc" }, NOW);
    assert.equal(result[0].id, "b");
  });

  it("sorts by estimated hours, longest first", () => {
    const result = applyFilters(rows, { ...EMPTY_FILTERS, sort: "hours" }, NOW);
    assert.equal(result[0].id, "b");
  });

  it("filters internal work apart from client work", () => {
    const internal = applyFilters(rows, { ...EMPTY_FILTERS, clientId: "internal" }, NOW);
    assert.deepEqual(internal.map((row) => row.id), ["d"]);

    const client = applyFilters(rows, { ...EMPTY_FILTERS, clientId: "client-1" }, NOW);
    assert.equal(client.length, 3);
  });

  it("combines a tab with a filter rather than replacing it", () => {
    const result = applyFilters(
      rows,
      { ...EMPTY_FILTERS, tab: "active", priority: "URGENT" },
      NOW,
    );

    assert.deepEqual(result.map((row) => row.id), ["b"]);
  });

  it("knows when nothing is narrowing the list", () => {
    assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
    assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, search: "meta" }), true);
    assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, todayOnly: true }), true);
  });
});

describe("how a due date reads", () => {
  it("says today, tomorrow, and how many days are left", () => {
    assert.equal(relativeDue("2026-08-12T23:00:00", NOW).label, "Today");
    assert.equal(relativeDue("2026-08-13T01:00:00", NOW).label, "Tomorrow");
    assert.equal(relativeDue("2026-08-15T00:00:00", NOW).label, "3 days left");
  });

  it("says how overdue something is, in whole days", () => {
    assert.equal(relativeDue("2026-08-11T00:00:00", NOW).label, "1 day overdue");
    assert.equal(relativeDue("2026-08-09T00:00:00", NOW).label, "3 days overdue");
    assert.equal(relativeDue("2026-08-09T00:00:00", NOW).tone, "overdue");
  });
});

describe("reading assets off a task", () => {
  it("pulls a URL out of a labelled line", () => {
    const assets = parseTaskAssets("Brand kit — https://drive.google.com/abc");

    assert.equal(assets.length, 1);
    assert.equal(assets[0].label, "Brand kit");
    assert.equal(assets[0].url, "https://drive.google.com/abc");
    assert.equal(assets[0].kind, "drive");
  });

  it("recognises the tools the agency actually uses", () => {
    const assets = parseTaskAssets(
      [
        "https://www.canva.com/design/xyz",
        "https://app.gohighlevel.com/location/abc",
        "https://example.com/logo.png",
        "https://example.com/copy.docx",
        "https://example.com/",
      ].join("\n"),
    );

    assert.deepEqual(
      assets.map((asset) => asset.kind),
      ["canva", "ghl", "image", "document", "website"],
    );
  });

  it("keeps a line with no link as a note rather than dropping it", () => {
    const assets = parseTaskAssets("Ask Sam for the raw footage");

    assert.equal(assets[0].url, null);
    assert.equal(assets[0].kind, "other");
  });

  it("lists nothing twice and copes with an empty field", () => {
    const assets = parseTaskAssets("https://a.test/x\nhttps://a.test/x", "https://a.test/x");

    assert.equal(assets.length, 1);
    assert.deepEqual(parseTaskAssets(null, null), []);
  });
});
