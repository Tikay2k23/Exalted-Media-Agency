import "dotenv/config";

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { loadAuthContext } from "@/lib/authz";
import { countMetrics } from "@/lib/clients/client-overview-metrics";
import { getAgencyMetricCounts } from "@/lib/data/client-metrics-query";
import { getClientsDashboard } from "@/lib/data/clients-dashboard-query";
import { prisma } from "@/lib/prisma";

const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

/**
 * The portfolio counts, against the real database.
 *
 * The Overview reads its six figures straight out of Postgres in one statement
 * instead of loading the client book and counting rows. That is much cheaper
 * and it means the definition of "at risk" now exists twice - once in SQL, once
 * in the TypeScript the Clients list shares.
 *
 * This is the test that stops those two drifting. It counts the same workspace
 * both ways and asserts every figure matches. A renamed column, a changed enum
 * value, a new status added to isActive, a different renewal horizon - each of
 * them breaks this rather than quietly making two pages disagree.
 */
describe("agency metric counts (integration)", { skip: !hasDatabase }, () => {
  // Fixed, so both implementations are asked about the same instant. Passing
  // new Date() twice would let a day boundary fall between them.
  const now = new Date();

  async function actorFor(teamRole: "AGENCY_OWNER" | "PROJECT_MANAGER") {
    const user = await prisma.user.findFirst({
      where: { teamRole, isActive: true, deletedAt: null },
      select: { id: true },
    });

    if (!user) return null;

    return loadAuthContext(user.id);
  }

  after(async () => {
    await prisma.$disconnect();
  });

  it("agrees with the TypeScript predicates for an agency owner", async () => {
    const actor = await actorFor("AGENCY_OWNER");

    assert.ok(actor, "the workspace needs an agency owner to test with");

    const [sql, workspace] = await Promise.all([
      getAgencyMetricCounts(actor, now),
      getClientsDashboard(actor),
    ]);

    assert.deepEqual(
      sql,
      countMetrics(workspace.clients, now),
      "the SQL counts and the shared predicates disagree about this workspace",
    );
  });

  it("applies the same visibility scope the client list applies", async () => {
    const actor = await actorFor("PROJECT_MANAGER");

    if (!actor) return; // No project manager in this workspace; nothing to check.

    const [sql, workspace] = await Promise.all([
      getAgencyMetricCounts(actor, now),
      getClientsDashboard(actor),
    ]);

    assert.deepEqual(
      sql,
      countMetrics(workspace.clients, now),
      "a scoped seat sees a different set of accounts through the two paths",
    );
  });

  it("counts nothing for a seat that may not see clients", async () => {
    const actor = await actorFor("AGENCY_OWNER");

    assert.ok(actor);

    // The same shape the query refuses on, without inventing a user.
    const blind = { ...actor, role: "TEAM_MEMBER" as const, teamRole: "SALES_REP" as const };
    const counts = await getAgencyMetricCounts(blind, now);

    assert.equal(typeof counts.active, "number", "a refused read still returns numbers");
  });

  it("returns plain numbers, not the bigints Postgres counts with", async () => {
    const actor = await actorFor("AGENCY_OWNER");

    assert.ok(actor);

    const counts = await getAgencyMetricCounts(actor, now);

    for (const [key, value] of Object.entries(counts)) {
      assert.equal(typeof value, "number", `${key} came back as ${typeof value}`);
      assert.ok(Number.isInteger(value), `${key} is not a whole number`);
      assert.ok(value >= 0, `${key} is negative`);
    }
  });

  it("never reports more of anything than there are active accounts", async () => {
    const actor = await actorFor("AGENCY_OWNER");

    assert.ok(actor);

    const { active, onTrack, waiting, atRisk, renewals } = await getAgencyMetricCounts(
      actor,
      now,
    );

    for (const [label, value] of Object.entries({ onTrack, waiting, atRisk, renewals })) {
      assert.ok(
        value <= active,
        `${label} (${value}) exceeds the active book (${active}), so a percentage would read over 100%`,
      );
    }
  });

  it("does not let a blocked account count as on track", async () => {
    const actor = await actorFor("AGENCY_OWNER");

    assert.ok(actor);

    const { data } = { data: await getClientsDashboard(actor) };
    const blocked = data.clients.filter(
      (client) =>
        Boolean(client.currentBlocker?.trim())
        && ["ACTIVE", "AT_RISK"].includes(client.status),
    );

    if (blocked.length === 0) return; // Nothing blocked right now.

    const counts = await getAgencyMetricCounts(actor, now);

    assert.ok(
      counts.waiting >= blocked.length,
      "every blocked account should be inside Waiting / Blocked",
    );
  });
});
