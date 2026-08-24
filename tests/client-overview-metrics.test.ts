import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { attentionItems } from "@/lib/clients/client-overview-attention";
import {
  METRIC_TONE,
  healthScoreLabel,
  metricHref,
} from "@/lib/clients/client-overview-metrics";
import type { ClientRow } from "@/lib/clients/client-workspace";

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

/**
 * How the Overview dresses the Journey board's six cards.
 *
 * The numbers and the words are the board's. What is checked here is that every
 * key it can hand over has a colour and an icon slot, and that no card claims to
 * go somewhere it cannot.
 */
describe("metric presentation", () => {
  const KEYS = [
    "active",
    "on-track",
    "waiting",
    "at-risk",
    "launching-soon",
    "renewals-due",
  ] as const;

  it("gives every card the board produces a tone", () => {
    for (const key of KEYS) {
      assert.ok(METRIC_TONE[key], `${key} would render without a colour`);
    }
  });

  it("links only the card that has somewhere real to go", () => {
    const linked = KEYS.filter((key) => metricHref(key) !== null);

    assert.deepEqual(linked, ["active"]);
    assert.equal(metricHref("active"), "/clients");
  });

  it("does not pretend the other cards filter the clients list", () => {
    // The list holds its filter in component state, not the URL, so a link
    // would land on an unfiltered page.
    for (const key of KEYS.filter((entry) => entry !== "active")) {
      assert.equal(metricHref(key), null, `${key} offers a link that cannot filter`);
    }
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
    // A real IntakeStatus value. The first version of this checked a status the
    // enum does not have, so it passed while PARTIALLY_COMPLETED was mislabelled.
    const [item] = attentionItems(client({ intakeStatus: "PARTIALLY_COMPLETED" }), NOW);

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
