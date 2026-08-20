import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { getJourneyWorkspaceData } from "@/lib/data/journey-queries";
import {
  exitReadiness,
  groupByPhase,
  stageAging,
} from "@/lib/journey/journey-board";
import { prisma } from "@/lib/prisma";

/**
 * Verifies what the Client Journey page shows each role.
 *
 * The scoping assertions here are the ones that keep one team member from
 * seeing another's accounts, so they are worth exercising against a real
 * database rather than a mock.
 */

const TEST_PREFIX = "zz-workspace-test";

const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

interface Fixtures {
  managerId: string;
  specialistId: string;
  otherSpecialistId: string;
  ownedClientId: string;
  otherClientId: string;
}

let fixtures: Fixtures | null = null;

async function cleanup() {
  const testClients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = testClients.map((client) => client.id);

  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipient: { email: { startsWith: TEST_PREFIX } } },
        ...(ids.length ? [{ entityId: { in: ids } }] : []),
      ],
    },
  });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { actor: { email: { startsWith: TEST_PREFIX } } },
        ...(ids.length ? [{ entityId: { in: ids } }] : []),
      ],
    },
  });
  await prisma.clientStageHistory.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.client.deleteMany({ where: { companyName: { startsWith: TEST_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

describe("journey workspace data (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "payment_received", isDeprecated: false },
      select: { id: true },
    });

    const makeUser = (name: string, suffix: string, teamRole: TeamRole) =>
      prisma.user.create({
        data: {
          name,
          email: `${TEST_PREFIX}-${suffix}@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole,
        },
        select: { id: true },
      });

    const [manager, specialist, otherSpecialist] = await Promise.all([
      makeUser("Workspace Manager", "manager", TeamRole.PROJECT_MANAGER),
      makeUser("Workspace Specialist", "specialist", TeamRole.ADS_SPECIALIST),
      makeUser("Other Specialist", "other", TeamRole.CREATIVE_SPECIALIST),
    ]);

    const makeClient = (label: string, ownerId: string | null) =>
      prisma.client.create({
        data: {
          clientName: `${label} Contact`,
          companyName: `${TEST_PREFIX} ${label}`,
          contactEmail: `${TEST_PREFIX}-${label}@example.test`,
          serviceType: "SEO",
          currentStageId: stage.id,
          assignedUserId: ownerId,
          // Placed in the past so time-in-stage is a real number.
          stageEnteredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });

    const [owned, other] = await Promise.all([
      makeClient("Owned", specialist.id),
      makeClient("Other", otherSpecialist.id),
    ]);

    fixtures = {
      managerId: manager.id,
      specialistId: specialist.id,
      otherSpecialistId: otherSpecialist.id,
      ownedClientId: owned.id,
      otherClientId: other.id,
    };
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("shows a specialist only the accounts assigned to them", async () => {
    const actor = await loadAuthContext(fixtures!.specialistId);
    assert.ok(actor);

    const data = await getJourneyWorkspaceData(actor);
    const ids = data.accounts.map((account) => account.id);

    assert.ok(ids.includes(fixtures!.ownedClientId));
    assert.ok(
      !ids.includes(fixtures!.otherClientId),
      "a specialist must not see another person's account",
    );
  });

  it("shows an operations manager every account", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const data = await getJourneyWorkspaceData(actor);
    const ids = data.accounts.map((account) => account.id);

    assert.ok(ids.includes(fixtures!.ownedClientId));
    assert.ok(ids.includes(fixtures!.otherClientId));
  });

  it("reports move and override authority per role", async () => {
    const manager = await loadAuthContext(fixtures!.managerId);
    const specialist = await loadAuthContext(fixtures!.specialistId);
    assert.ok(manager && specialist);

    const managerData = await getJourneyWorkspaceData(manager);
    const specialistData = await getJourneyWorkspaceData(specialist);

    assert.equal(managerData.canMove, true);
    assert.equal(managerData.canOverride, true);

    // A specialist can see the journey but cannot move accounts through it.
    assert.equal(specialistData.canMove, false);
    assert.equal(specialistData.canOverride, false);
  });

  it("computes time in stage and flags accounts past the stage target", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const data = await getJourneyWorkspaceData(actor);
    const account = data.accounts.find((row) => row.id === fixtures!.ownedClientId);

    assert.ok(account);

    const aging = stageAging(account, new Date());

    assert.equal(aging.days, 10);
    // Payment Received carries a one day target, so ten days is over it.
    assert.equal(aging.targetDays, 1);
    assert.equal(aging.isOverTarget, true);
    assert.equal(aging.overBy, 9);
    assert.equal(aging.label, "9 days over target");
  });

  it("returns only current journey stages, never retired ones", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const data = await getJourneyWorkspaceData(actor);

    assert.equal(data.stages.length, 18, "the SOP defines eighteen journey stages");

    const retired = await prisma.pipelineStage.findMany({
      where: { isDeprecated: true },
      select: { id: true },
    });
    const retiredIds = new Set(retired.map((stage) => stage.id));

    assert.ok(
      data.stages.every((stage) => !retiredIds.has(stage.id)),
      "a retired stage must not be offered as a destination",
    );
  });

  it("reports how many requirements guard each stage", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const data = await getJourneyWorkspaceData(actor);
    const production = data.stages.find((stage) => stage.stageKey === "in_production");

    assert.ok(production);
    assert.equal(production.requirementCount, 9);
  });

  it("groups accounts onto the four phases of the board", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const data = await getJourneyWorkspaceData(actor);
    const columns = groupByPhase(data.accounts);

    assert.deepEqual(
      columns.map((column) => column.phase),
      ["STARTUP", "PRODUCTION", "LAUNCH", "RETENTION"],
    );

    const startup = columns.find((column) => column.phase === "STARTUP");

    assert.ok(startup);
    assert.ok(
      startup.accounts.some((account) => account.id === fixtures!.ownedClientId),
      "an account in Payment Received belongs to the Startup phase",
    );

    // Every account lands in exactly one column, so none can be lost.
    assert.equal(
      columns.reduce((total, column) => total + column.accounts.length, 0),
      data.accounts.length,
    );
  });

  it("evaluates the next stage gate as exit criteria, from the same rows", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const data = await getJourneyWorkspaceData(actor);
    const account = data.accounts.find((row) => row.id === fixtures!.ownedClientId);

    assert.ok(account);
    // Payment Received is position 1, so the next live stage follows it.
    assert.equal(account.nextStageName, "Onboarding Form Sent");

    const readiness = exitReadiness(account);

    assert.equal(readiness.total, account.exitCriteria.length);
    assert.equal(
      readiness.canAdvance,
      account.exitCriteria.every((rule) => rule.satisfied || !rule.isBlocking),
    );
  });
});
