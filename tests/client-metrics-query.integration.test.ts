import "dotenv/config";

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { loadAuthContext } from "@/lib/authz";
import {
  getJourneyHealthByClient,
  getJourneySummaryCards,
} from "@/lib/data/client-metrics-query";
import { getJourneyWorkspaceData } from "@/lib/data/journey-queries";
import { HEALTH_LABELS, deriveHealth, summaryCards } from "@/lib/journey/journey-board";
import { prisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

/**
 * The portfolio row on a client's Overview, against the real database.
 *
 * The Overview and the Journey board show the same six cards, and they must
 * show the same six numbers. They did not: the Overview counted them from the
 * stored health assessment while the board derives them operationally, and on
 * eleven accounts at one moment the board said nine at risk and none on track
 * while the Overview said none at risk and five on track.
 *
 * The fix was to stop having a second definition - the Overview calls the
 * board's own summaryCards over the board's own accounts. This is the test that
 * keeps it that way. It is deliberately an equality check against the real
 * board rather than a restatement of the rules, because a restatement is the
 * thing that broke.
 */
describe("overview portfolio row (integration)", { skip: !hasDatabase }, () => {
  // One instant for both, so a day boundary cannot fall between the two reads
  // and make stage aging differ.
  const now = new Date();

  async function actorFor(teamRole: "AGENCY_OWNER" | "PROJECT_MANAGER") {
    const user = await prisma.user.findFirst({
      where: { teamRole, isActive: true, deletedAt: null },
      select: { id: true },
    });

    return user ? loadAuthContext(user.id) : null;
  }

  after(async () => {
    await prisma.$disconnect();
  });

  it("shows exactly what the journey board shows, for an agency owner", async () => {
    const actor = await actorFor("AGENCY_OWNER");

    assert.ok(actor, "the workspace needs an agency owner to test with");

    const [overview, workspace] = await Promise.all([
      getJourneySummaryCards(actor, now),
      getJourneyWorkspaceData(actor),
    ]);

    assert.deepEqual(
      overview,
      summaryCards(workspace.accounts, now),
      "the Overview and the Journey board disagree about this workspace",
    );
  });

  it("keeps agreeing for a seat that only sees its own accounts", async () => {
    const actor = await actorFor("PROJECT_MANAGER");

    if (!actor) return; // No project manager here; nothing to compare.

    const [overview, workspace] = await Promise.all([
      getJourneySummaryCards(actor, now),
      getJourneyWorkspaceData(actor),
    ]);

    assert.deepEqual(
      overview,
      summaryCards(workspace.accounts, now),
      "the two paths scope the client list differently",
    );
  });

  it("returns the six cards in the board's order", async () => {
    const actor = await actorFor("AGENCY_OWNER");

    assert.ok(actor);

    const cards = await getJourneySummaryCards(actor, now);

    assert.deepEqual(
      cards.map((card) => card.key),
      ["active", "on-track", "waiting", "at-risk", "launching-soon", "renewals-due"],
    );
  });

  it("counts whole non-negative numbers", async () => {
    const actor = await actorFor("AGENCY_OWNER");

    assert.ok(actor);

    for (const card of await getJourneySummaryCards(actor, now)) {
      assert.ok(Number.isInteger(card.value), `${card.key} is not a whole number`);
      assert.ok(card.value >= 0, `${card.key} is negative`);
      assert.ok(card.label.length > 0, `${card.key} has no label`);
    }
  });

  it("never reports more of anything than there are active accounts", async () => {
    const actor = await actorFor("AGENCY_OWNER");

    assert.ok(actor);

    const cards = await getJourneySummaryCards(actor, now);
    const active = cards.find((card) => card.key === "active")!.value;

    for (const card of cards.filter((entry) => entry.key !== "active")) {
      assert.ok(
        card.value <= active,
        `${card.key} (${card.value}) exceeds the active book (${active}), so its percentage would read over 100%`,
      );
    }
  });
});

/**
 * The Dashboard's client chip, against the real database.
 *
 * It used to answer from the reader's own tasks: an account with a missed
 * milestone and no late tasks of theirs read "On Track" while the Journey board
 * called it "At Risk", and every blocked account read "At Risk" because that
 * vocabulary had no "Blocked". Now all three pages ask deriveHealth.
 */
describe("dashboard client health (integration)", { skip: !hasDatabase }, () => {
  const now = new Date();

  after(async () => {
    await prisma.$disconnect();
  });

  async function owner() {
    const user = await prisma.user.findFirstOrThrow({
      where: { teamRole: "AGENCY_OWNER", isActive: true, deletedAt: null },
      select: { id: true },
    });

    return loadAuthContext(user.id);
  }

  it("gives every visible account the health the journey board gives it", async () => {
    const actor = await owner();

    assert.ok(actor);

    const [health, workspace] = await Promise.all([
      getJourneyHealthByClient(actor, now),
      getJourneyWorkspaceData(actor),
    ]);

    assert.equal(health.size, workspace.accounts.length, "an account is missing its health");

    for (const account of workspace.accounts) {
      assert.equal(
        health.get(account.id),
        deriveHealth(account, now),
        `${account.companyName} reads differently on the dashboard than on the board`,
      );
    }
  });

  it("only ever produces labels the dashboard chip can colour", async () => {
    const actor = await owner();

    assert.ok(actor);

    const allowed = new Set(Object.values(HEALTH_LABELS));

    for (const value of (await getJourneyHealthByClient(actor, now)).values()) {
      assert.ok(allowed.has(HEALTH_LABELS[value]), `${value} has no label`);
    }
  });
});
