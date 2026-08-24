import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attentionItems } from "@/lib/clients/client-overview-attention";
import {
  LAUNCH_HORIZON_DAYS,
  agencyMetrics,
  healthScoreLabel,
  isLaunchingSoon,
} from "@/lib/clients/client-overview-metrics";
import type { ClientMilestone, ClientRow } from "@/lib/clients/client-workspace";

const NOW = new Date("2026-08-22T12:00:00.000Z");
const DAY = 86_400_000;

function client(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: "c1",
    companyName: "Cedar Ridge Landscaping",
    clientName: "Tom Brennan",
    contactEmail: "tom@example.test",
    contactPhone: null,
    status: "ACTIVE",
    healthStatus: "GREEN",
    stageId: "s1",
    stageName: "Access & Assets Collection",
    stageKey: "access_collection",
    ownerId: "u1",
    ownerName: "Mark Angelo Yakit",
    serviceType: "WEBSITE_SUPPORT",
    services: [],
    monthlyValue: 1800,
    contractStartDate: null,
    contractEndDate: null,
    renewalDate: null,
    currentBlocker: null,
    nextAction: "Chase the logins",
    nextActionDueAt: null,
    lastClientUpdateAt: null,
    dateAdded: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    openTaskCount: 0,
    overdueTaskCount: 0,
    waitingTaskCount: 0,
    criticalAccessMissing: 0,
    intakeStatus: null,
    openDefectCount: 0,
    awaitingReviewCount: 0,
    overdueReportCount: 0,
    lastActivityAt: NOW.toISOString(),
    lastActivityLabel: null,
    milestones: [],
    ...overrides,
  } as ClientRow;
}

function launch(daysAway: number): ClientMilestone {
  return {
    id: "m1",
    clientId: "c1",
    clientName: "Cedar Ridge Landscaping",
    name: "Go live",
    source: "launch",
    dueAt: new Date(NOW.getTime() + daysAway * DAY).toISOString(),
    hasTime: false,
    tab: "quality",
    status: null,
  };
}

const metric = (rows: ClientRow[], key: string) =>
  agencyMetrics(rows, NOW).find((card) => card.key === key)!;

/**
 * The portfolio row across the top of a client's Overview.
 *
 * These are agency-wide by design. What has to hold is that every count runs
 * through the predicate that already defines the same word on the Clients list,
 * so the two pages cannot report different numbers for "at risk".
 */
describe("agency metrics", () => {
  it("shows the six cards the design calls for, in order", () => {
    assert.deepEqual(
      agencyMetrics([client()], NOW).map((card) => card.key),
      ["active", "on-track", "waiting", "at-risk", "launching", "renewals"],
    );
  });

  it("counts an at-risk account as active, because it still is one", () => {
    const rows = [client({ status: "ACTIVE" }), client({ id: "c2", status: "AT_RISK" })];

    assert.equal(metric(rows, "active").value, 2);
  });

  it("leaves churned and paused accounts out of the book", () => {
    const rows = [client(), client({ id: "c2", status: "CHURNED" })];

    assert.equal(metric(rows, "active").value, 1);
  });

  it("does not let a green assessment outrank a recorded blocker", () => {
    const rows = [client({ healthStatus: "GREEN", currentBlocker: "Waiting on DNS" })];

    assert.equal(metric(rows, "on-track").value, 0, "a blocked account is not on track");
    assert.equal(metric(rows, "waiting").value, 1);
  });

  it("counts waiting on the client and blocked as one figure", () => {
    const rows = [
      client({ waitingTaskCount: 2 }),
      client({ id: "c2", currentBlocker: "No access" }),
      client({ id: "c3", criticalAccessMissing: 1 }),
    ];

    assert.equal(metric(rows, "waiting").value, 3);
  });

  it("takes percentages of the active book, not of every row ever created", () => {
    const rows = [
      client({ healthStatus: "GREEN" }),
      client({ id: "c2", healthStatus: "RED" }),
      client({ id: "c3", status: "CHURNED", healthStatus: "GREEN" }),
    ];

    // One of the two active accounts is on track.
    assert.equal(metric(rows, "on-track").detail, "50% of clients");
  });

  it("does not divide by zero when nothing is live", () => {
    const rows = [client({ status: "CHURNED" })];

    assert.equal(metric(rows, "on-track").value, 0);
    assert.equal(metric(rows, "on-track").detail, "No active clients");
  });

  it("links only the card that has somewhere real to go", () => {
    const linked = agencyMetrics([client()], NOW).filter((card) => card.href);

    assert.deepEqual(linked.map((card) => card.key), ["active"]);
    assert.equal(linked[0].href, "/clients");
  });

  it("reads Launching Soon from launch dates inside the horizon", () => {
    assert.equal(isLaunchingSoon(client({ milestones: [launch(3)] }), NOW), true);
    assert.equal(
      isLaunchingSoon(client({ milestones: [launch(LAUNCH_HORIZON_DAYS + 5)] }), NOW),
      false,
      "a launch beyond the horizon is not soon",
    );
    assert.equal(
      isLaunchingSoon(client({ milestones: [launch(-3)] }), NOW),
      false,
      "a launch that already happened is not upcoming",
    );
  });

  it("ignores dated records that are not launches", () => {
    const renewal = { ...launch(3), source: "renewal" as const };

    assert.equal(isLaunchingSoon(client({ milestones: [renewal] }), NOW), false);
  });

  it("counts a renewal inside the horizon, including one already past", () => {
    const rows = [
      client({ renewalDate: new Date(NOW.getTime() + 20 * DAY).toISOString() }),
      client({ id: "c2", renewalDate: new Date(NOW.getTime() - 5 * DAY).toISOString() }),
      client({ id: "c3", renewalDate: new Date(NOW.getTime() + 300 * DAY).toISOString() }),
    ];

    assert.equal(metric(rows, "renewals").value, 2);
  });
});

describe("health score label", () => {
  it("reads a score in words rather than out of a hundred", () => {
    assert.equal(healthScoreLabel(92), "Excellent");
    assert.equal(healthScoreLabel(72), "Good");
    assert.equal(healthScoreLabel(55), "Fair");
    assert.equal(healthScoreLabel(20), "Poor");
  });
});

/**
 * The Needs Attention rows.
 *
 * The rule that matters is about the button: sending the intake form lives on
 * Strategy, and no row here may offer to send one. There is also no reminder
 * workflow in this application, so nothing may claim to send a reminder either.
 */
describe("attention items", () => {
  it("says nothing about a healthy account", () => {
    assert.deepEqual(attentionItems(client(), NOW), []);
  });

  it("sends an unsent intake to Strategy rather than offering to send it", () => {
    const [item] = attentionItems(client({ intakeStatus: "NOT_SENT" }), NOW);

    assert.equal(item.title, "Intake Form Not Sent");
    assert.equal(item.action.label, "Go to Strategy");
    assert.equal(item.action.tab, "services");
  });

  it("sends a half-finished intake to Strategy too", () => {
    const [item] = attentionItems(client({ intakeStatus: "IN_PROGRESS" }), NOW);

    assert.equal(item.title, "Onboarding Form Incomplete");
    assert.equal(item.action.label, "Open Intake Setup");
    assert.equal(item.action.tab, "services");
  });

  it("never offers to send or remind from the overview", () => {
    const busy = client({
      intakeStatus: "SENT",
      overdueTaskCount: 2,
      criticalAccessMissing: 1,
      currentBlocker: "No DNS access",
      awaitingReviewCount: 1,
      openDefectCount: 1,
      overdueReportCount: 1,
      renewalDate: new Date(NOW.getTime() + 10 * DAY).toISOString(),
    });

    for (const item of attentionItems(busy, NOW)) {
      assert.doesNotMatch(
        item.action.label,
        /send|remind/i,
        `"${item.action.label}" claims to send something this application cannot send`,
      );
    }
  });

  it("never points a row at the tab it is already on", () => {
    const idle = client({ nextAction: null });
    const items = attentionItems(idle, NOW);

    assert.ok(items.length > 0, "an account with no next action should say so");
    for (const item of items) {
      assert.notEqual(
        item.action.tab,
        "overview",
        `${item.key} sends the reader back to the page they are reading`,
      );
    }
  });

  it("gives every row a heading, a context line and somewhere to act", () => {
    const busy = client({
      overdueTaskCount: 1,
      criticalAccessMissing: 2,
      intakeStatus: "SENT",
      currentBlocker: "No access",
      awaitingReviewCount: 1,
      openDefectCount: 3,
      overdueReportCount: 1,
      nextAction: null,
      lastActivityAt: new Date(NOW.getTime() - 30 * DAY).toISOString(),
      renewalDate: new Date(NOW.getTime() + 5 * DAY).toISOString(),
    });

    const items = attentionItems(busy, NOW);

    assert.ok(items.length >= 8, "every reason should produce a row");
    for (const item of items) {
      assert.ok(item.title.length > 0, `${item.key} has no title`);
      assert.match(item.context, /Cedar Ridge Landscaping · /);
      assert.ok(item.description.length > 0, `${item.key} has no description`);
      assert.ok(item.action.label.length > 0, `${item.key} has no action`);
    }
  });

  it("keeps the worst thing first", () => {
    const items = attentionItems(
      client({ currentBlocker: "No DNS access", overdueReportCount: 1 }),
      NOW,
    );

    assert.equal(items[0].key, "blocker");
  });

  it("reads a single overdue task as singular", () => {
    const [item] = attentionItems(client({ overdueTaskCount: 1 }), NOW);

    assert.equal(item.title, "1 Overdue Task");
  });
});
