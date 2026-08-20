import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTION_TYPES,
  groupTitleFor,
  type NotificationRow,
  actionLabelFor,
  categoryOf,
  groupNotifications,
  matchesTab,
  relativeTimeLabel,
  sortNotifications,
  tabCounts,
} from "@/lib/notifications-view";

/**
 * The rules behind the notification popup.
 *
 * All of it is derived from the type and urgency already stored, so every rule
 * the interface follows can be stated here without a database.
 */

const NOW = new Date("2026-08-20T12:00:00.000Z");

function minutesAgo(minutes: number) {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function row(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: Math.random().toString(36).slice(2, 10),
    type: "TASK_ASSIGNED",
    urgency: "NORMAL",
    title: "A notification",
    body: null,
    href: "/work",
    entityType: null,
    entityId: null,
    readAt: null,
    createdAt: minutesAgo(5),
    subject: null,
    ...overrides,
  };
}

describe("categories", () => {
  it("treats critical urgency as critical whatever the type says", () => {
    assert.equal(categoryOf("TASK_ASSIGNED", "CRITICAL"), "CRITICAL");
    assert.equal(categoryOf("APPROVAL_RECEIVED", "CRITICAL"), "CRITICAL");
    assert.equal(categoryOf("MISSING_ACCESS", "CRITICAL"), "CRITICAL");
  });

  it("puts anything owed under Action Required", () => {
    for (const type of ACTION_TYPES) {
      assert.equal(
        categoryOf(type, "NORMAL"),
        "ACTION",
        `${type} needs somebody to do something`,
      );
    }
  });

  it("puts things that merely happened under Updates", () => {
    assert.equal(categoryOf("APPROVAL_RECEIVED", "NORMAL"), "UPDATE");
    assert.equal(categoryOf("LAUNCH_SCHEDULED", "LOW"), "UPDATE");
    assert.equal(categoryOf("CLIENT_HEALTH_CHANGE", "NORMAL"), "UPDATE");
  });

  it("never files something needing review as a plain update", () => {
    assert.notEqual(categoryOf("REPORT_DUE", "NORMAL"), "UPDATE");
    assert.notEqual(categoryOf("REVISION_REQUEST", "NORMAL"), "UPDATE");
    assert.notEqual(categoryOf("APPROVAL_REQUIRED", "NORMAL"), "UPDATE");
  });

  it("falls back to Update for a type it has never seen", () => {
    assert.equal(categoryOf("SOMETHING_ADDED_LATER", "NORMAL"), "UPDATE");
  });
});

describe("actions", () => {
  it("offers a verb that matches the notification", () => {
    assert.equal(actionLabelFor("MISSING_ACCESS"), "Review Access");
    assert.equal(actionLabelFor("REPORT_DUE"), "Review Report");
    assert.equal(actionLabelFor("CLIENT_WAITING"), "Send Follow-Up");
    assert.equal(actionLabelFor("TASK_ASSIGNED"), "Open Task");
    assert.equal(actionLabelFor("LAUNCH_INCIDENT"), "View Blocker");
    assert.equal(actionLabelFor("REVISION_REQUEST"), "View Feedback");
  });

  it("offers nothing when there is no obvious verb", () => {
    assert.equal(actionLabelFor("APPROVAL_RECEIVED"), null);
  });
});

describe("tabs", () => {
  const rows = [
    row({ type: "AUDIT_FINDING", urgency: "CRITICAL" }),
    row({ type: "APPROVAL_REQUIRED" }),
    row({ type: "TASK_ASSIGNED" }),
    row({ type: "APPROVAL_RECEIVED" }),
  ];

  it("counts each notification into exactly one tab", () => {
    const counts = tabCounts(rows);

    assert.equal(counts.all, 4);
    assert.equal(counts.critical + counts.action + counts.updates, counts.all);
    assert.equal(counts.critical, 1);
    assert.equal(counts.action, 2);
    assert.equal(counts.updates, 1);
  });

  it("shows everything under All", () => {
    assert.ok(rows.every((entry) => matchesTab(entry, "all")));
  });
});

describe("ordering", () => {
  it("puts unread critical first and read last", () => {
    const sorted = sortNotifications([
      row({ id: "read-critical", urgency: "CRITICAL", readAt: minutesAgo(1) }),
      row({ id: "unread-update", type: "APPROVAL_RECEIVED" }),
      row({ id: "unread-critical", urgency: "CRITICAL" }),
      row({ id: "unread-action", type: "REPORT_DUE" }),
      row({ id: "read-action", type: "REPORT_DUE", readAt: minutesAgo(1) }),
    ]);

    assert.deepEqual(
      sorted.map((entry) => entry.id),
      [
        "unread-critical",
        "unread-action",
        "unread-update",
        "read-critical",
        "read-action",
      ],
    );
  });

  it("shows the newest first within a group", () => {
    const sorted = sortNotifications([
      row({ id: "older", type: "REPORT_DUE", createdAt: minutesAgo(60) }),
      row({ id: "newer", type: "REPORT_DUE", createdAt: minutesAgo(2) }),
    ]);

    assert.deepEqual(
      sorted.map((entry) => entry.id),
      ["newer", "older"],
    );
  });
});

describe("grouping", () => {
  it("folds repeats of the same type into one line", () => {
    const groups = groupNotifications([
      row({ type: "REPORT_DUE", title: "Weekly Report Ready", subject: "Ada" }),
      row({ type: "REPORT_DUE", title: "Weekly Report Ready", subject: "Ben" }),
      row({ type: "REPORT_DUE", title: "Weekly Report Ready", subject: "Cara" }),
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].count, 3);
    assert.equal(
      groups[0].title,
      "3 reports to review",
      "a folded row is named from the type, not by adding an s to a sentence",
    );
    assert.equal(groups[0].body, "Ada + 2 others");
    assert.equal(groups[0].members.length, 3, "every folded row is still reachable");
  });

  it("leaves a single notification exactly as it was", () => {
    const groups = groupNotifications([
      row({ type: "REPORT_DUE", title: "Weekly Report Ready", body: "Ada's report." }),
    ]);

    assert.equal(groups[0].count, 1);
    assert.equal(groups[0].title, "Weekly Report Ready");
    assert.equal(groups[0].body, "Ada's report.");
  });

  it("never folds read and unread together", () => {
    const groups = groupNotifications([
      row({ type: "REPORT_DUE", title: "Weekly Report Ready" }),
      row({ type: "REPORT_DUE", title: "Weekly Report Ready", readAt: minutesAgo(1) }),
    ]);

    assert.equal(groups.length, 2);
    assert.equal(groups.filter((group) => group.unread).length, 1);
  });

  it("never hides an unread critical inside another group", () => {
    const groups = groupNotifications([
      row({ type: "AUDIT_FINDING", urgency: "CRITICAL", title: "Audit failed" }),
      ...Array.from({ length: 20 }, () =>
        row({ type: "APPROVAL_REQUIRED", title: "Approval required" }),
      ),
    ]);

    assert.equal(groups[0].category, "CRITICAL", "the critical group leads");
    assert.equal(groups[0].count, 1);
    assert.equal(groups[1].count, 20, "the noise is folded behind it");
  });

  it("names a folded row properly rather than pluralising a sentence", () => {
    assert.equal(groupTitleFor("APPROVAL_REQUIRED", 31), "31 approval requests");
    assert.equal(groupTitleFor("AUDIT_FINDING", 17), "17 audit findings");
    assert.equal(groupTitleFor("TASK_OVERDUE", 1), "1 overdue task");
    assert.equal(groupTitleFor("SOMETHING_NEW", 4), "4 notifications");
  });

  it("carries the action label onto the group", () => {
    const groups = groupNotifications([
      row({ type: "MISSING_ACCESS" }),
      row({ type: "MISSING_ACCESS" }),
    ]);

    assert.equal(groups[0].actionLabel, "Review Access");
  });
});

describe("relative time", () => {
  it("reads the way the popup asks for", () => {
    assert.equal(relativeTimeLabel(minutesAgo(0), NOW), "Just now");
    assert.equal(relativeTimeLabel(minutesAgo(2), NOW), "2 min ago");
    assert.equal(relativeTimeLabel(minutesAgo(12), NOW), "12 min ago");
    assert.equal(relativeTimeLabel(minutesAgo(60), NOW), "1 hr ago");
    assert.equal(relativeTimeLabel(minutesAgo(180), NOW), "3 hrs ago");
  });

  it("says Yesterday once midnight has been crossed", () => {
    // Built from NOW in local time: a fixed UTC instant lands on a different
    // calendar day depending on where the machine is, and the label is about
    // the local calendar.
    const yesterdayEvening = new Date(NOW);

    yesterdayEvening.setDate(yesterdayEvening.getDate() - 1);
    yesterdayEvening.setHours(22, 0, 0, 0);

    assert.equal(relativeTimeLabel(yesterdayEvening, NOW), "Yesterday");

    const lastWeek = new Date(NOW);

    lastWeek.setDate(lastWeek.getDate() - 6);

    assert.equal(
      relativeTimeLabel(lastWeek, NOW),
      lastWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    );
  });

  it("still counts hours inside the same day", () => {
    const earlier = new Date(NOW);

    earlier.setHours(1, 0, 0, 0);

    const label = relativeTimeLabel(earlier, NOW);

    assert.match(label, /hrs? ago$/, "same calendar day reads in hours");
  });

  it("never produces the shouted timestamp the old popup used", () => {
    const label = relativeTimeLabel(minutesAgo(5), NOW);

    assert.equal(label, label.replace(/[A-Z]{3,}/g, ""), "no uppercase runs");
    assert.ok(!label.includes(" at "), "no 'AUG 20, 2026 AT 4:43 AM'");
  });
});
