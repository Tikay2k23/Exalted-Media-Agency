import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { overviewCardHref, overviewCards } from "@/lib/clients/client-overview-cards";
import type { ClientRow } from "@/lib/clients/client-workspace";

/**
 * The five cards at the top of a client's Overview.
 *
 * The property worth protecting is that they describe *this* client. The
 * reference design put the agency-wide row here, and the failure mode if that
 * ever creeps back is subtle: the page looks right and answers the wrong
 * question.
 */

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
    nextAction: null,
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
    milestones: [],
    ...overrides,
  } as ClientRow;
}

const cardFor = (key: string, row: ClientRow = client()) =>
  overviewCards(row, NOW).find((card) => card.key === key)!;

describe("client overview cards", () => {
  it("shows five cards, all about this client", () => {
    const cards = overviewCards(client(), NOW);

    assert.deepEqual(
      cards.map((card) => card.key),
      ["journey", "health", "work", "milestone", "renewal"],
    );
  });

  it("reads journey progress from the stage the client is actually in", () => {
    // Stored stage keys, which is what journeyPosition indexes - not the
    // twelve-stage display grouping the Journey board uses for its phases.
    const early = cardFor("journey", client({ stageKey: "payment_received" }));
    const later = cardFor("journey", client({ stageKey: "live_active" }));

    assert.match(early.value, /^\d+%$/);
    assert.ok(
      Number.parseInt(later.value, 10) > Number.parseInt(early.value, 10),
      "a later stage should read as further along",
    );
    assert.match(early.detail, /stages done/);
  });

  it("does not claim progress for an unrecognised stage", () => {
    assert.equal(cardFor("journey", client({ stageKey: null })).value, "0%");
  });

  it("lets an active blocker outrank a green assessment", () => {
    const green = cardFor("health", client({ healthStatus: "GREEN" }));
    const blocked = cardFor(
      "health",
      client({ healthStatus: "GREEN", currentBlocker: "Waiting on DNS access" }),
    );

    assert.equal(green.tone, "good");
    assert.equal(blocked.value, "Blocked");
    assert.equal(blocked.tone, "bad", "a blocked account must not read as healthy");
  });

  it("says Clear rather than 0 when there is no work", () => {
    const card = cardFor("work");

    assert.equal(card.value, "Clear");
    assert.equal(card.tone, "good");
  });

  it("turns the work card red as soon as anything is overdue", () => {
    const card = cardFor("work", client({ openTaskCount: 8, overdueTaskCount: 1 }));

    assert.equal(card.value, "8");
    assert.match(card.detail, /1 overdue/);
    assert.equal(card.tone, "bad");
  });

  it("counts an overdue renewal as past, not as time remaining", () => {
    const card = cardFor(
      "renewal",
      client({ renewalDate: new Date(NOW.getTime() - 5 * DAY).toISOString() }),
    );

    assert.match(card.detail, /5 days past/);
    assert.equal(card.tone, "bad");
  });

  it("warns inside the same renewal window the clients list uses", () => {
    const soon = cardFor(
      "renewal",
      client({ renewalDate: new Date(NOW.getTime() + 30 * DAY).toISOString() }),
    );
    const distant = cardFor(
      "renewal",
      client({ renewalDate: new Date(NOW.getTime() + 300 * DAY).toISOString() }),
    );

    assert.equal(soon.tone, "warn");
    assert.equal(distant.tone, "neutral");
  });

  it("offers a useful empty state rather than a blank card", () => {
    assert.equal(cardFor("renewal").value, "Not set");
    assert.equal(cardFor("renewal").detail, "No renewal date configured");
    assert.equal(cardFor("milestone").value, "None");
  });

  it("points every card at a tab on this client", () => {
    for (const card of overviewCards(client(), NOW)) {
      const href = overviewCardHref(card, "abc123");

      assert.match(href, /^\/clients\/abc123\?tab=(journey|tasks|reports)$/);
    }
  });
});
