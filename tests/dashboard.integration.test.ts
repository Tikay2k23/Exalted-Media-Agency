import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { getRoleDashboard } from "@/lib/data/dashboard-queries";
import { prisma } from "@/lib/prisma";

/**
 * Every seat must get a dashboard that loads, says something useful, and never
 * shows another person's work.
 */

const TEST_PREFIX = "zz-dashboard-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

const seatIds = new Map<TeamRole, string>();
let ownedTaskId = "";
let otherTaskId = "";

async function cleanup() {
  await prisma.employeeTask.deleteMany({ where: { title: { startsWith: TEST_PREFIX } } });
  await prisma.notification.deleteMany({
    where: { recipient: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.activityLog.deleteMany({
    where: { actor: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

describe("role dashboards (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    for (const teamRole of Object.values(TeamRole)) {
      const user = await prisma.user.create({
        data: {
          name: `Dashboard ${teamRole}`,
          email: `${TEST_PREFIX}-${teamRole.toLowerCase()}@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole,
        },
        select: { id: true },
      });

      seatIds.set(teamRole, user.id);
    }

    const creative = seatIds.get(TeamRole.CREATIVE_SPECIALIST)!;
    const automation = seatIds.get(TeamRole.AUTOMATION_SPECIALIST)!;
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    /*
     * Older than anything already in the database, deliberately.
     *
     * The project manager's overdue section is everybody's work, capped at the
     * eight most overdue and sorted by due date. A fixture due yesterday is
     * therefore invisible to it the moment the database holds more than eight
     * older overdue tasks - which any real dataset does, so this test failed on
     * a developer machine while passing on an empty one. Anchoring the fixtures
     * below the current minimum puts them at the front of that ordering
     * whatever else exists, without deleting anyone's data to get there.
     */
    const { _min } = await prisma.employeeTask.aggregate({
      where: { deletedAt: null },
      _min: { dueDate: true },
    });
    const anchor = Math.min(_min.dueDate?.getTime() ?? Date.now(), Date.now());
    const oldest = new Date(anchor - 2 * 24 * 60 * 60 * 1000);
    const secondOldest = new Date(anchor - 24 * 60 * 60 * 1000);

    const [owned, other] = await Promise.all([
      prisma.employeeTask.create({
        data: {
          title: `${TEST_PREFIX} creative work`,
          assignedToId: creative,
          dueDate: oldest,
          weekStartDate: yesterday,
          status: "IN_PROGRESS",
        },
        select: { id: true },
      }),
      prisma.employeeTask.create({
        data: {
          title: `${TEST_PREFIX} automation work`,
          assignedToId: automation,
          dueDate: secondOldest,
          weekStartDate: yesterday,
          status: "IN_PROGRESS",
        },
        select: { id: true },
      }),
    ]);

    ownedTaskId = owned.id;
    otherTaskId = other.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("builds a working dashboard for every seat", async () => {
    for (const teamRole of Object.values(TeamRole)) {
      const actor = await loadAuthContext(seatIds.get(teamRole)!);
      assert.ok(actor, teamRole);

      const data = await getRoleDashboard(actor);

      assert.equal(data.isDegraded, false, `${teamRole} dashboard failed to load`);
      assert.ok(data.seatLabel.length > 0, `${teamRole} has no seat label`);
      assert.ok(data.sections.length > 0, `${teamRole} has no sections`);

      // An empty section still has to say something useful.
      for (const section of data.sections) {
        assert.ok(section.title.length > 0, `${teamRole}: section without a title`);
        assert.ok(
          section.emptyMessage.length > 0,
          `${teamRole}: "${section.title}" has no empty state`,
        );
      }
    }
  });

  it("shows a specialist their own overdue work and nobody else's", async () => {
    const actor = await loadAuthContext(seatIds.get(TeamRole.CREATIVE_SPECIALIST)!);
    assert.ok(actor);

    const data = await getRoleDashboard(actor);
    const overdue = data.sections.find((section) => section.key === "overdue");

    assert.ok(overdue);
    const ids = overdue.items.map((item) => item.id);

    assert.ok(ids.includes(ownedTaskId), "their own overdue work is missing");
    assert.ok(
      !ids.includes(otherTaskId),
      "a specialist must not see another person's work on their dashboard",
    );
  });

  it("shows the project manager everyone's overdue work", async () => {
    const actor = await loadAuthContext(seatIds.get(TeamRole.PROJECT_MANAGER)!);
    assert.ok(actor);

    const data = await getRoleDashboard(actor);
    const overdue = data.sections.find((section) => section.key === "overdue");

    assert.ok(overdue);
    const ids = overdue.items.map((item) => item.id);

    assert.ok(ids.includes(ownedTaskId));
    assert.ok(ids.includes(otherTaskId));
  });

  it("gives the owner the money and risk figures, and nobody else", async () => {
    const owner = await loadAuthContext(seatIds.get(TeamRole.AGENCY_OWNER)!);
    assert.ok(owner);

    const ownerData = await getRoleDashboard(owner);
    const labels = ownerData.headlines.map((headline) => headline.label);

    assert.ok(labels.includes("Monthly recurring"));
    assert.ok(labels.includes("Clients at risk"));

    for (const teamRole of Object.values(TeamRole)) {
      if (teamRole === TeamRole.AGENCY_OWNER) continue;

      const actor = await loadAuthContext(seatIds.get(teamRole)!);
      assert.ok(actor);

      const data = await getRoleDashboard(actor);
      assert.ok(
        !data.headlines.some((headline) => headline.label === "Monthly recurring"),
        `${teamRole} must not see revenue`,
      );
    }
  });

  it("gives sales a lead-shaped dashboard rather than a work queue", async () => {
    const actor = await loadAuthContext(seatIds.get(TeamRole.SALES_REP)!);
    assert.ok(actor);

    const data = await getRoleDashboard(actor);
    const keys = data.sections.map((section) => section.key);

    assert.deepEqual(keys, ["overdue-followups", "uncontacted", "no-next-action"]);
  });

  it("marks overdue items as overdue so urgency is not carried by colour alone", async () => {
    const actor = await loadAuthContext(seatIds.get(TeamRole.CREATIVE_SPECIALIST)!);
    assert.ok(actor);

    const data = await getRoleDashboard(actor);
    const item = data.sections
      .flatMap((section) => section.items)
      .find((candidate) => candidate.id === ownedTaskId);

    assert.ok(item);
    assert.equal(item.urgency, "overdue");
    assert.match(item.detail, /overdue/);
  });

  it("points every item at a page that exists", async () => {
    const allowed = ["/dashboard", "/fulfillment", "/leads", "/clients/"];

    for (const teamRole of Object.values(TeamRole)) {
      const actor = await loadAuthContext(seatIds.get(teamRole)!);
      assert.ok(actor);

      const data = await getRoleDashboard(actor);

      for (const item of data.sections.flatMap((section) => section.items)) {
        assert.ok(
          allowed.some((prefix) => item.href.startsWith(prefix)),
          `${teamRole}: "${item.title}" links to ${item.href}, which is not a built page`,
        );
      }
    }
  });
});
