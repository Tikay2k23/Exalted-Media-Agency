import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import {
  activateLaunch,
  createLaunch,
  recordMonitoringCheck,
  setChecklistItemStatus,
  updateLaunch,
} from "@/lib/launch/launch-service";
import { prisma } from "@/lib/prisma";

const TEST_PREFIX = "zz-launch-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let specialistId = "";
let launchId = "";
let ownerId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);
  const launches = await prisma.launch.findMany({
    where: { clientId: { in: ids } },
    select: { id: true },
  });
  const launchIds = launches.map((launch) => launch.id);

  await prisma.monitoringCheck.deleteMany({ where: { launchId: { in: launchIds } } });
  await prisma.launchChecklistItem.deleteMany({ where: { launchId: { in: launchIds } } });
  await prisma.launch.deleteMany({ where: { clientId: { in: ids } } });
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

async function blockedKeys() {
  const stage = await prisma.pipelineStage.findFirstOrThrow({
    where: { stageKey: "ready_for_launch", isDeprecated: false },
    select: {
      requirements: {
        select: { requirementKey: true, label: true, isBlocking: true },
        orderBy: { position: "asc" },
      },
    },
  });

  const client = await loadClientForEvaluation(clientId);
  assert.ok(client);

  return evaluateStageRequirements(client, stage.requirements).blocking.map(
    (item) => item.key,
  );
}

describe("launches (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const [pm, specialist, owner] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Launch Test PM",
          email: `${TEST_PREFIX}-pm@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.PROJECT_MANAGER,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Launch Test Specialist",
          email: `${TEST_PREFIX}-specialist@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.CREATIVE_SPECIALIST,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Launch Test Owner",
          email: `${TEST_PREFIX}-owner@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.AGENCY_OWNER,
        },
        select: { id: true },
      }),
    ]);

    pmId = pm.id;
    specialistId = specialist.id;
    ownerId = owner.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "client_approved", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Launch Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "WEBSITE_SUPPORT",
        currentStageId: stage.id,
        assignedUserId: pm.id,
      },
      select: { id: true },
    });

    clientId = client.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("refuses launch scheduling to a specialist", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await createLaunch({
      actor: specialist,
      clientId,
      data: { name: "Unauthorised launch" },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("blocks Ready for Launch while no launch exists", async () => {
    const blocked = await blockedKeys();

    assert.ok(blocked.includes("launch_record_owned"));
    assert.ok(blocked.includes("backup_verified"));
  });

  it("seeds the standard checklist when a launch is scheduled", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await createLaunch({
      actor: pm,
      clientId,
      data: { name: "Website go-live", ownerId: pmId },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    launchId = result.launch.id;

    const items = await prisma.launchChecklistItem.count({ where: { launchId } });
    assert.equal(items, 16, "the SOP checklist has sixteen points");
  });

  it("clears the owner gate but still wants a backup and rollback plan", async () => {
    const blocked = await blockedKeys();

    assert.ok(!blocked.includes("launch_record_owned"));
    assert.ok(blocked.includes("backup_verified"));
  });

  it("refuses to go live with an unfinished checklist", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    await updateLaunch({
      actor: pm,
      launchId,
      data: { backupVerified: true, rollbackPlan: "Restore snapshot, repoint DNS." },
    });

    const result = await activateLaunch({ actor: pm, launchId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NOT_READY");
    assert.ok((result.blockers ?? []).some((blocker) => /checklist/i.test(blocker)));
  });

  it("clears the backup gate once both the backup and plan are recorded", async () => {
    assert.ok(!(await blockedKeys()).includes("backup_verified"));
  });

  it("refuses to go live while frozen, even with everything else done", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const items = await prisma.launchChecklistItem.findMany({
      where: { launchId },
      select: { id: true },
    });

    for (const item of items) {
      await setChecklistItemStatus({ actor: pm, itemId: item.id, status: "COMPLETE" });
    }

    await updateLaunch({
      actor: pm,
      launchId,
      data: { isFrozen: true, freezeReason: "Client asked to hold until Monday." },
    });

    const result = await activateLaunch({ actor: pm, launchId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok((result.blockers ?? []).some((blocker) => /frozen/i.test(blocker)));
  });

  it("refuses to freeze a launch without a reason", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await updateLaunch({
      actor: pm,
      launchId,
      data: { isFrozen: true, freezeReason: "" },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("goes live once ready, and opens the four monitoring windows", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    await updateLaunch({ actor: pm, launchId, data: { isFrozen: false } });

    const result = await activateLaunch({ actor: pm, launchId });
    assert.equal(result.ok, true);

    const launch = await prisma.launch.findUniqueOrThrow({
      where: { id: launchId },
      select: { status: true, completedAt: true },
    });
    assert.equal(launch.status, "MONITORING");
    assert.ok(launch.completedAt);

    const checks = await prisma.monitoringCheck.findMany({
      where: { launchId },
      orderBy: { dueAt: "asc" },
      select: { window: true, result: true, dueAt: true },
    });

    assert.deepEqual(
      checks.map((check) => check.window),
      ["FIRST_TWO_HOURS", "FIRST_24_HOURS", "FIRST_72_HOURS", "FIRST_7_DAYS"],
    );
    assert.ok(checks.every((check) => check.result === "PENDING"));
    // Windows are scheduled from the moment it actually went live.
    assert.ok(checks[0].dueAt! > launch.completedAt!);
  });

  it("refuses to activate the same launch twice", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await activateLaunch({ actor: pm, launchId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("will not record a monitoring result without observations", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const check = await prisma.monitoringCheck.findFirstOrThrow({
      where: { launchId },
      select: { id: true },
    });

    const result = await recordMonitoringCheck({
      actor: pm,
      checkId: check.id,
      result: "HEALTHY",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("records a monitoring result with what was observed", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const check = await prisma.monitoringCheck.findFirstOrThrow({
      where: { launchId, window: "FIRST_TWO_HOURS" },
      select: { id: true },
    });

    const result = await recordMonitoringCheck({
      actor: pm,
      checkId: check.id,
      result: "HEALTHY",
      observations: "Forms submitting, three leads through, tracking firing.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.check.checkedAt);
    assert.equal(result.check.checkedById, pmId);
  });

  it("tells agency leadership the client is live", async () => {
    // The project manager here is also the launch owner and the account owner,
    // which is normal in a six-person agency. Without leadership on the list
    // this alert would reach nobody at all.
    const notifications = await prisma.notification.findMany({
      where: { entityId: clientId, urgency: "CRITICAL" },
      select: { title: true, recipientId: true },
    });

    assert.ok(notifications.some((notification) => /is live/.test(notification.title)));
    assert.ok(notifications.some((notification) => notification.recipientId === ownerId));
    // Nobody is told about their own action.
    assert.ok(notifications.every((notification) => notification.recipientId !== pmId));
  });
});
