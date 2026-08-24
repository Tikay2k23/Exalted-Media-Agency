import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activityStamp,
  relativeDayLabel,
  workBreakdown,
} from "@/lib/clients/client-overview-cards";

const NOW = new Date("2026-08-22T12:00:00.000Z");
const DAY = 86_400_000;

/**
 * How the overview counts a client's work.
 *
 * The bucket that matters most is the one that is absent: cancelled work. A
 * total that quietly includes it disagrees with every other count of this
 * client's work on the page, and nobody means "eight tasks" to include three
 * that were called off.
 */
describe("work breakdown", () => {
  const task = (status: string, dueDate: Date | null = null) => ({ status, dueDate });

  it("groups ten statuses into the five the summary reports", () => {
    const { buckets, total } = workBreakdown(
      [
        task("DONE"), task("APPROVED"),
        task("IN_PROGRESS"),
        task("NEEDS_REVIEW"), task("REVISION_REQUIRED"),
        task("BLOCKED"), task("WAITING_CLIENT"),
        task("TODO"), task("BACKLOG"),
      ],
      NOW,
    );

    assert.equal(total, 9);
    // The order the donut and its legend both read in.
    assert.deepEqual(
      buckets.map((bucket) => [bucket.key, bucket.count]),
      [["completed", 2], ["inProgress", 1], ["blocked", 2], ["review", 2], ["todo", 2]],
    );
  });

  it("leaves cancelled work out of the total", () => {
    const { total, buckets } = workBreakdown(
      [task("DONE"), task("CANCELLED"), task("CANCELLED")],
      NOW,
    );

    assert.equal(total, 1, "cancelled work must not inflate the count");
    assert.deepEqual(buckets.map((bucket) => bucket.key), ["completed"]);
  });

  it("hides buckets with nothing in them", () => {
    const { buckets } = workBreakdown([task("IN_PROGRESS")], NOW);

    assert.deepEqual(buckets.map((bucket) => bucket.key), ["inProgress"]);
  });

  it("counts overdue work that is still outstanding", () => {
    const past = new Date(NOW.getTime() - DAY);

    assert.equal(workBreakdown([task("IN_PROGRESS", past)], NOW).overdue, 1);
    assert.equal(workBreakdown([task("BLOCKED", past)], NOW).overdue, 1);
  });

  it("does not call finished work overdue", () => {
    const past = new Date(NOW.getTime() - DAY);

    assert.equal(
      workBreakdown([task("DONE", past), task("APPROVED", past)], NOW).overdue,
      0,
      "work that was late but is finished is not something to act on",
    );
  });

  it("reports an empty client as empty rather than guessing", () => {
    const empty = workBreakdown([], NOW);

    assert.equal(empty.total, 0);
    assert.equal(empty.overdue, 0);
    assert.deepEqual(empty.buckets, []);
  });
});

describe("relative day label", () => {
  it("says today, tomorrow and yesterday rather than counting to one", () => {
    assert.equal(relativeDayLabel(NOW, NOW), "today");
    assert.equal(relativeDayLabel(new Date(NOW.getTime() + DAY), NOW), "tomorrow");
    assert.equal(relativeDayLabel(new Date(NOW.getTime() - DAY), NOW), "yesterday");
  });

  it("distinguishes ahead from overdue", () => {
    assert.equal(relativeDayLabel(new Date(NOW.getTime() + 3 * DAY), NOW), "in 3 days");
    assert.equal(relativeDayLabel(new Date(NOW.getTime() - 4 * DAY), NOW), "4 days overdue");
  });
});

/**
 * When something happened, in the activity feed's words.
 *
 * The property worth holding is that "Today" means today by the calendar, not
 * within the last 24 hours - an entry from 1am is still today at 11pm.
 */
describe("activity stamp", () => {
  const noon = new Date(2026, 7, 22, 12, 0, 0);

  it("names today by the calendar day, not by elapsed hours", () => {
    const earlyToday = new Date(2026, 7, 22, 1, 15, 0);

    assert.match(activityStamp(earlyToday, noon), /^Today at /);
  });

  it("calls the previous calendar day yesterday", () => {
    const lateYesterday = new Date(2026, 7, 21, 23, 30, 0);

    assert.match(activityStamp(lateYesterday, noon), /^Yesterday at /);
  });

  it("falls back to a dated stamp further back", () => {
    const stamp = activityStamp(new Date(2026, 7, 15, 11, 20, 0), noon);

    assert.match(stamp, /^Aug 15, 2026 at /);
  });
});
