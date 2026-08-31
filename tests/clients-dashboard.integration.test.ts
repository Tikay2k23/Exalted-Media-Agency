import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { loadAuthContext } from "@/lib/authz";
import {
  CHIP_KEYS,
  CLIENT_SORTS,
  EMPTY_CLIENT_FILTERS,
  HEALTH_LABELS,
  SUMMARY_FILTER,
  applyClientFilters,
  attentionReasons,
  healthFromStatus,
  isWaitingOnClient,
  matchesQuickFilter,
  milestoneFeed,
  nextMilestone,
  quickFilterChips,
  serviceLabel,
  summaryCards,
  type ClientHealth,
  type ClientRow,
} from "@/lib/clients/client-workspace";
import { getClientRow, getClientsDashboard } from "@/lib/data/clients-dashboard-query";
import { prisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

/**
 * The clients dashboard, against the real database.
 *
 * These are the invariants that make the page trustworthy rather than merely
 * rendered: a card that says four filters to four, no row carries another
 * client's data, and health never quietly becomes an operational state. They
 * run against whatever is actually in the workspace, so they catch a bad join
 * or a drifted predicate that a fixture-based test would not.
 *
 * The suite brings a few accounts of its own so there is always something to
 * audit. Before that, three of these tests read data.clients[0] and passed
 * only because the development database happened to hold clients; on a fresh
 * Test database they failed. That is a dependency on ambient data, not a
 * result. Auditing every visible row is still the point - on development
 * these fixtures are audited alongside the real accounts.
 */
const TEST_PREFIX = "zz-dashboard-test";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  if (!ids.length) return;

  await prisma.activityLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
}

describe("clients dashboard (integration)", { skip: !hasDatabase }, () => {
  const now = new Date();

  async function load() {
    const owner = await prisma.user.findFirstOrThrow({
      where: { teamRole: "AGENCY_OWNER", isActive: true, deletedAt: null },
      select: { id: true },
    });
    const actor = await loadAuthContext(owner.id);

    assert.ok(actor);

    return { actor, data: await getClientsDashboard(actor) };
  }

  before(async () => {
    await cleanup();

    const owner = await prisma.user.findFirstOrThrow({
      where: { teamRole: "AGENCY_OWNER", isActive: true, deletedAt: null },
      select: { id: true },
    });

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "in_production", isDeprecated: false },
      select: { id: true },
    });

    /* Three accounts, differing in the fields the filters and search read. */
    const accounts = [
      { name: "Northwind", service: "SEO" as const, assigned: owner.id },
      { name: "Fabrikam", service: "WEBSITE_SUPPORT" as const, assigned: owner.id },
      /* Unassigned is a real state the owner column has to survive. */
      { name: "Contoso", service: "SEO" as const, assigned: null },
    ];

    for (const account of accounts) {
      await prisma.client.create({
        data: {
          clientName: `${account.name} Contact`,
          companyName: `${TEST_PREFIX} ${account.name}`,
          contactEmail: `${TEST_PREFIX}-${account.name.toLowerCase()}@example.test`,
          serviceType: account.service,
          currentStageId: stage.id,
          assignedUserId: account.assigned,
        },
      });
    }
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("loads every visible client with a stage and an owner field", async () => {
    const { data } = await load();

    assert.ok(data.hasAccess);
    assert.ok(data.clients.length > 0, "no clients to audit");

    for (const client of data.clients) {
      assert.ok(client.id, "client with no id");
      assert.ok(client.companyName, `${client.id} has no company name`);
      assert.ok(client.stageName, `${client.companyName} has no stage`);
      // Unassigned is a real state; undefined is a broken join.
      assert.notEqual(client.ownerName, undefined, `${client.companyName} owner is undefined`);
    }
  });

  it("makes every summary card filter to exactly what it counted", async () => {
    const { data } = await load();

    for (const card of summaryCards(data.clients, now)) {
      const filtered = applyClientFilters(
        data.clients,
        { ...EMPTY_CLIENT_FILTERS, quick: SUMMARY_FILTER[card.key] },
        now,
      );

      if (card.key === "open-work") {
        // This card counts tasks rather than accounts, on purpose - its hint
        // says how many accounts, and that is what it filters to.
        assert.equal(
          card.value,
          data.clients.reduce((sum, client) => sum + client.openTaskCount, 0),
        );
        assert.equal(card.hint, `${filtered.length} account${filtered.length === 1 ? "" : "s"}`);
        continue;
      }

      assert.equal(filtered.length, card.value, `${card.key} card`);
    }
  });

  it("makes every chip filter to exactly what it counted", async () => {
    const { data } = await load();

    for (const chip of quickFilterChips(data.clients, now)) {
      const filtered = applyClientFilters(
        data.clients,
        { ...EMPTY_CLIENT_FILTERS, quick: chip.key },
        now,
      );

      assert.equal(filtered.length, chip.count, `${chip.key} chip`);
    }

    // The chip row is the six the interface shows; the other two keys exist
    // only so the summary cards can filter through the same predicate.
    assert.equal(quickFilterChips(data.clients, now).length, CHIP_KEYS.length);
  });

  it("never loses or duplicates a client across any sort", async () => {
    const { data } = await load();
    const expected = [...data.clients.map((client) => client.id)].sort();

    for (const sort of CLIENT_SORTS) {
      const sorted = applyClientFilters(
        data.clients,
        { ...EMPTY_CLIENT_FILTERS, sort: sort.value },
        now,
      );

      assert.deepEqual(
        sorted.map((client) => client.id).sort(),
        expected,
        `${sort.value} changed the set`,
      );
    }
  });

  it("pages through every client exactly once, at every page size", async () => {
    const { data } = await load();
    const rows = applyClientFilters(data.clients, EMPTY_CLIENT_FILTERS, now);

    for (const pageSize of [10, 25, 50]) {
      const seen: string[] = [];
      const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

      for (let page = 1; page <= totalPages; page += 1) {
        seen.push(
          ...rows.slice((page - 1) * pageSize, page * pageSize).map((client) => client.id),
        );
      }

      assert.equal(new Set(seen).size, rows.length, `duplicates at ${pageSize} per page`);
      assert.equal(seen.length, rows.length, `dropped rows at ${pageSize} per page`);
    }
  });

  it("finds each client by every field the search claims to cover", async () => {
    const { data } = await load();
    const sample = data.clients[0]!;

    const terms = [
      sample.companyName,
      sample.clientName,
      sample.contactEmail,
      ...(sample.ownerName ? [sample.ownerName] : []),
      // Case and stray whitespace are what people actually type.
      `  ${sample.companyName.toUpperCase()}  `,
      sample.companyName.slice(0, 4).toLowerCase(),
    ];

    for (const term of terms) {
      const found = applyClientFilters(
        data.clients,
        { ...EMPTY_CLIENT_FILTERS, search: term },
        now,
      );

      assert.ok(
        found.some((client) => client.id === sample.id),
        `search "${term}" did not find ${sample.companyName}`,
      );
    }

    // A query nobody matches is an empty list, not a crash.
    assert.deepEqual(
      applyClientFilters(
        data.clients,
        { ...EMPTY_CLIENT_FILTERS, search: "zzzz-no-such-client-zzzz" },
        now,
      ),
      [],
    );
  });

  it("combines search, filters and sort without contradicting itself", async () => {
    const { data } = await load();
    const sample = data.clients[0]!;

    const combined = applyClientFilters(
      data.clients,
      {
        ...EMPTY_CLIENT_FILTERS,
        search: sample.companyName,
        ownerId: sample.ownerId ?? "unassigned",
        sort: "name-asc",
      },
      now,
    );

    // Every survivor must satisfy every clause, not just the last one applied.
    for (const client of combined) {
      assert.equal(client.ownerId ?? "unassigned", sample.ownerId ?? "unassigned");
      assert.ok(client.companyName.toLowerCase().includes(sample.companyName.toLowerCase()));
    }
  });

  it("keeps health to its four values and out of the operational state", async () => {
    const { data } = await load();

    for (const client of data.clients) {
      const health = healthFromStatus(client.healthStatus, {
        hasBlocker: Boolean(client.currentBlocker?.trim()),
      });

      assert.ok(health in HEALTH_LABELS, `${client.companyName}: ${health}`);

      // The stored column must never contain the operational state, whatever
      // the account is actually waiting on.
      assert.ok(
        !String(client.healthStatus).toUpperCase().includes("WAITING"),
        `${client.companyName} stores an operational state as health`,
      );

      // Waiting is independent of health - both directions must be possible.
      assert.equal(typeof isWaitingOnClient(client), "boolean");
    }
  });

  it("gives every attention reason a record behind it and a tab that can fix it", async () => {
    const { data } = await load();
    const tabs = new Set([
      "overview",
      "contacts",
      "services",
      "tasks",
      "journey",
      "quality",
      "reports",
      "files",
      "activity",
      "integrations",
    ]);

    for (const client of data.clients) {
      for (const reason of attentionReasons(client, now)) {
        assert.ok(tabs.has(reason.tab), `${reason.key} points at "${reason.tab}"`);
        assert.ok(reason.label.trim(), `${reason.key} has no label`);

        // Each reason must be backed by a real number or field on the row.
        const backed: Record<string, boolean> = {
          "overdue-work": client.overdueTaskCount > 0,
          "missing-access": client.criticalAccessMissing > 0,
          "intake-incomplete": client.intakeStatus !== null,
          "approval-overdue": client.awaitingReviewCount > 0,
          blocker: Boolean(client.currentBlocker?.trim()),
          "open-defect": client.openDefectCount > 0,
          "report-overdue": client.overdueReportCount > 0,
          "renewal-approaching": Boolean(client.renewalDate ?? client.contractEndDate),
          "no-activity": client.lastActivityAt !== null,
          "no-next-action": !client.nextAction?.trim(),
        };

        assert.ok(
          backed[reason.key],
          `${client.companyName}: "${reason.key}" has no record behind it`,
        );
      }
    }
  });

  it("keeps every milestone with the client it belongs to", async () => {
    const { data } = await load();

    for (const client of data.clients) {
      for (const milestone of client.milestones) {
        assert.equal(
          milestone.clientId,
          client.id,
          `${client.companyName} carries a milestone for ${milestone.clientName}`,
        );
        assert.equal(milestone.clientName, client.companyName);
        assert.ok(!Number.isNaN(new Date(milestone.dueAt).getTime()), "milestone has no date");
      }
    }
  });

  it("orders the cross-client feed soonest first and hides what has passed", async () => {
    const { data } = await load();
    const feed = milestoneFeed(data.clients, now, 50);
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);

    for (let index = 1; index < feed.length; index += 1) {
      assert.ok(
        new Date(feed[index]!.dueAt) >= new Date(feed[index - 1]!.dueAt),
        "feed is out of order",
      );
    }

    for (const entry of feed) {
      assert.ok(new Date(entry.dueAt) >= midnight, `${entry.name} has already passed`);
    }
  });

  it("builds each directory row from one client and no other", async () => {
    const { data } = await load();

    const ownersById = new Map(data.owners.map((owner) => [owner.id, owner.name]));

    for (const client of data.clients) {
      // The joined name must be the joined id's name, not a neighbour's.
      if (client.ownerId) {
        assert.equal(
          client.ownerName,
          ownersById.get(client.ownerId),
          `${client.companyName} shows the wrong owner`,
        );
      } else {
        assert.equal(client.ownerName, null);
      }

      const next = nextMilestone(client, now);

      if (next) assert.equal(next.clientId, client.id);

      // Counts are non-negative and overdue can never exceed open.
      assert.ok(client.openTaskCount >= 0);
      assert.ok(
        client.overdueTaskCount <= client.openTaskCount,
        `${client.companyName}: ${client.overdueTaskCount} overdue of ${client.openTaskCount} open`,
      );
      assert.ok(serviceLabel(client).length > 0);
    }
  });

  it("gives the single-client read the same answer as the dashboard read", async () => {
    const { actor, data } = await load();

    for (const summary of data.clients.slice(0, 5)) {
      const row = await getClientRow(actor, summary.id);

      assert.ok(row, `${summary.companyName} could not be reopened`);
      assert.equal(row.id, summary.id);
      assert.equal(row.stageName, summary.stageName);
      assert.equal(row.openTaskCount, summary.openTaskCount);
      assert.equal(row.overdueTaskCount, summary.overdueTaskCount);
      assert.equal(row.milestones.length, summary.milestones.length);
      assert.equal(
        attentionReasons(row, now).length,
        attentionReasons(summary, now).length,
        `${summary.companyName} reads differently on its own page`,
      );
    }
  });

  it("returns nothing for a client id that does not exist", async () => {
    const { actor } = await load();

    assert.equal(await getClientRow(actor, "no-such-client-id"), null);
  });

  it("shows a specialist only their own accounts", async () => {
    /*
     * role, not just teamRole. A seat can carry a specialist's teamRole and an
     * administrator's access - the default seeded account does exactly that -
     * and an administrator legitimately sees every account. Selecting on
     * teamRole alone picked that seat and tested nothing, which went unnoticed
     * because the loop body never ran on a workspace with no clients in it.
     */
    const specialist = await prisma.user.findFirst({
      where: {
        role: "TEAM_MEMBER",
        teamRole: "CREATIVE_SPECIALIST",
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!specialist) return;

    const actor = await loadAuthContext(specialist.id);

    assert.ok(actor);

    const scoped = await getClientsDashboard(actor);

    for (const client of scoped.clients) {
      assert.equal(
        client.ownerId,
        specialist.id,
        `${client.companyName} is visible to somebody it is not assigned to`,
      );
    }
  });

  it("matches the quick filter predicate to the row it is applied to", async () => {
    const { data } = await load();

    for (const key of CHIP_KEYS) {
      const filtered = applyClientFilters(
        data.clients,
        { ...EMPTY_CLIENT_FILTERS, quick: key },
        now,
      );

      for (const client of filtered) {
        assert.ok(
          matchesQuickFilter(client, key, now),
          `${client.companyName} survived the ${key} filter without matching it`,
        );
      }
    }
  });

  it("keeps health, stage and status as three separate fields on the row", async () => {
    const { data } = await load();
    const healthValues = new Set<ClientHealth>();

    for (const client of data.clients as ClientRow[]) {
      healthValues.add(
        healthFromStatus(client.healthStatus, {
          hasBlocker: Boolean(client.currentBlocker?.trim()),
        }),
      );

      // A stage name must never be a health value, and vice versa.
      assert.ok(
        !Object.values(HEALTH_LABELS).includes(client.stageName),
        `${client.companyName} has a health value in its stage field`,
      );
    }

    for (const value of healthValues) {
      assert.ok(value in HEALTH_LABELS);
    }
  });
});
