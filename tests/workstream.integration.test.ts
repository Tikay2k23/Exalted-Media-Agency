import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { moveClientStage } from "@/lib/journey/transition";
import { prisma } from "@/lib/prisma";
import { syncWorkstreams, workstreamOwners } from "@/lib/workflow/workstream-service";

const TEST_PREFIX = "zz-workstream-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let crmClientId = "";
let fullClientId = "";
let ownerId = "";
let pmId = "";
let automationId = "";
let creativeId = "";
let adsId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.clientHandoff.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientWorkstream.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.employeeTask.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientStageHistory.deleteMany({ where: { clientId: { in: ids } } });
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
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function stageId(stageKey: string) {
  const stage = await prisma.pipelineStage.findFirstOrThrow({
    where: { stageKey, isDeprecated: false },
    select: { id: true },
  });

  return stage.id;
}

describe("workstreams and handoffs (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const makeUser = (name: string, suffix: string, teamRole: TeamRole) =>
      prisma.user.create({
        data: {
          name,
          email: `${TEST_PREFIX}-${suffix}@example.test`,
          passwordHash: "not-a-real-hash",
          role: teamRole === TeamRole.AGENCY_OWNER ? Role.OWNER : Role.TEAM_MEMBER,
          teamRole,
        },
        select: { id: true },
      });

    const [owner, pm, automation, creative, ads] = await Promise.all([
      makeUser("WS Owner", "owner", TeamRole.AGENCY_OWNER),
      makeUser("WS PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("WS Automation", "automation", TeamRole.AUTOMATION_SPECIALIST),
      makeUser("WS Creative", "creative", TeamRole.CREATIVE_SPECIALIST),
      makeUser("WS Ads", "ads", TeamRole.ADS_SPECIALIST),
    ]);

    ownerId = owner.id;
    pmId = pm.id;
    automationId = automation.id;
    creativeId = creative.id;
    adsId = ads.id;

    const strategyStage = await stageId("strategy_and_planning");

    const makeClient = (suffix: string, serviceType: "CRM_AUTOMATION" | "FULL_SERVICE_RETAINER") =>
      prisma.client.create({
        data: {
          clientName: `WS ${suffix}`,
          companyName: `${TEST_PREFIX} ${suffix}`,
          contactEmail: `${TEST_PREFIX}-${suffix}@example.test`,
          serviceType,
          currentStageId: strategyStage,
          assignedUserId: pm.id,
          currentOwnerRole: TeamRole.PROJECT_MANAGER,
          currentOwnerId: pm.id,
        },
        select: { id: true },
      });

    const [crm, full] = await Promise.all([
      makeClient("CRM Only", "CRM_AUTOMATION"),
      makeClient("Full Service", "FULL_SERVICE_RETAINER"),
    ]);

    crmClientId = crm.id;
    fullClientId = full.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("creates only the workstreams a CRM-only client needs", async () => {
    const streams = await syncWorkstreams({
      clientId: crmClientId,
      service: "CRM_AUTOMATION",
      owners: { AUTOMATION_SPECIALIST: automationId, PROJECT_MANAGER: pmId },
    });

    const roles = streams.map((stream) => stream.role).sort();

    assert.deepEqual(roles, ["AUTOMATION_SPECIALIST", "PROJECT_MANAGER", "SALES_REP"]);
    // No creative or ads stream. Nobody has to close work that was never real.
    assert.ok(!roles.includes("CREATIVE_SPECIALIST" as never));
  });

  it("creates all three specialist streams for a full-service client", async () => {
    const streams = await syncWorkstreams({
      clientId: fullClientId,
      service: "FULL_SERVICE_RETAINER",
      owners: {
        PROJECT_MANAGER: pmId,
        AUTOMATION_SPECIALIST: automationId,
        CREATIVE_SPECIALIST: creativeId,
        ADS_SPECIALIST: adsId,
      },
    });

    assert.equal(streams.length, 5);
  });

  it("is idempotent - syncing twice does not duplicate a stream", async () => {
    const before = await prisma.clientWorkstream.count({ where: { clientId: crmClientId } });

    await syncWorkstreams({ clientId: crmClientId, service: "CRM_AUTOMATION" });

    const after = await prisma.clientWorkstream.count({ where: { clientId: crmClientId } });

    assert.equal(after, before);
  });

  it("retires a stream the client no longer needs rather than deleting it", async () => {
    // The work somebody already did on it is real; deleting the row takes its
    // history with it.
    await syncWorkstreams({ clientId: fullClientId, service: "CRM_AUTOMATION" });

    const creative = await prisma.clientWorkstream.findUniqueOrThrow({
      where: { clientId_role: { clientId: fullClientId, role: "CREATIVE_SPECIALIST" } },
      select: { stage: true, isRequired: true },
    });

    assert.equal(creative.stage, "NOT_REQUIRED");
    assert.equal(creative.isRequired, false);

    // And it comes back when the client buys the service again.
    await syncWorkstreams({
      clientId: fullClientId,
      service: "FULL_SERVICE_RETAINER",
      owners: { CREATIVE_SPECIALIST: creativeId },
    });

    const revived = await prisma.clientWorkstream.findUniqueOrThrow({
      where: { clientId_role: { clientId: fullClientId, role: "CREATIVE_SPECIALIST" } },
      select: { stage: true, isRequired: true, ownerId: true },
    });

    assert.equal(revived.stage, "ASSIGNED");
    assert.equal(revived.isRequired, true);
    assert.equal(revived.ownerId, creativeId);
  });

  it("reports who holds each seat, for routing", async () => {
    const owners = await workstreamOwners(crmClientId);

    assert.equal(owners.AUTOMATION_SPECIALIST, automationId);
    assert.equal(owners.PROJECT_MANAGER, pmId);
  });

  it("hands the client to the specialist when it moves into production", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await moveClientStage({
      clientId: crmClientId,
      targetStageId: await stageId("in_production"),
      actor: owner,
      override: {
        reason: "Test fixture moving straight into production for the handoff check.",
        riskAcknowledged: true,
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.handedOffTo, "AUTOMATION_SPECIALIST");

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: crmClientId },
      select: { currentOwnerRole: true, currentOwnerId: true },
    });

    assert.equal(client.currentOwnerRole, "AUTOMATION_SPECIALIST");
    assert.equal(client.currentOwnerId, automationId);
  });

  it("records the handoff in the timeline", async () => {
    const handoff = await prisma.clientHandoff.findFirstOrThrow({
      where: { clientId: crmClientId },
      orderBy: { handedOffAt: "desc" },
      select: { fromRole: true, toRole: true, toUserId: true, stageKey: true },
    });

    assert.equal(handoff.fromRole, "PROJECT_MANAGER");
    assert.equal(handoff.toRole, "AUTOMATION_SPECIALIST");
    assert.equal(handoff.toUserId, automationId);
    assert.equal(handoff.stageKey, "in_production");
  });

  it("tells the specialist the client is theirs", async () => {
    const notified = await prisma.notification.findMany({
      where: { entityId: crmClientId, recipientId: automationId },
      select: { title: true },
    });

    assert.ok(notified.some((item) => /is now yours/i.test(item.title)));
  });

  it("keeps a parallel client with the project manager", async () => {
    // Full service puts three specialists to work at once. Naming one of them
    // as the holder would be arbitrary; the coordinator is the real answer.
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await moveClientStage({
      clientId: fullClientId,
      targetStageId: await stageId("in_production"),
      actor: owner,
      override: {
        reason: "Test fixture moving straight into production for the handoff check.",
        riskAcknowledged: true,
      },
    });

    assert.equal(result.ok, true);

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: fullClientId },
      select: { currentOwnerRole: true },
    });

    assert.equal(client.currentOwnerRole, "PROJECT_MANAGER");
  });

  it("does not record a handoff when ownership did not change", async () => {
    // Moving between two stages the project manager holds is not a handoff,
    // and logging it as one would bury the real ones.
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const before = await prisma.clientHandoff.count({ where: { clientId: fullClientId } });

    await moveClientStage({
      clientId: fullClientId,
      targetStageId: await stageId("internal_quality_assurance"),
      actor: owner,
      override: {
        reason: "Test fixture moving to QA to check that no handoff is recorded.",
        riskAcknowledged: true,
      },
    });

    const after = await prisma.clientHandoff.count({ where: { clientId: fullClientId } });

    assert.equal(after, before);
  });
});
