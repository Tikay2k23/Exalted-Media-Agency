import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { getRequirementRemedy } from "@/lib/journey/requirement-remedies";
import { moveClientStage } from "@/lib/journey/transition";
import { prisma } from "@/lib/prisma";

/**
 * End-to-end verification of the stage gate against a real database.
 *
 * Everything created here is namespaced with TEST_PREFIX and removed in the
 * cleanup hook, so the suite can run against a working database without
 * leaving anything behind.
 */

const TEST_PREFIX = "zz-journey-test";

const hasDatabase = Boolean(
  process.env.DATABASE_URL ?? process.env.DIRECT_URL,
);

interface Fixtures {
  clientId: string;
  managerId: string;
  specialistId: string;
  paymentStageId: string;
  productionStageId: string;
}

let fixtures: Fixtures | null = null;

async function stageIdFor(stageKey: string) {
  const stage = await prisma.pipelineStage.findFirst({
    where: { stageKey, isDeprecated: false },
    select: { id: true },
  });

  if (!stage) {
    throw new Error(`Stage "${stageKey}" is missing. Run "npm run db:seed" first.`);
  }

  return stage.id;
}

async function cleanup() {
  // Override alerts are delivered to real oversight accounts, not just to the
  // test users, so notifications must be cleared by the entity they point at.
  const testClients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const testClientIds = testClients.map((client) => client.id);

  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipient: { email: { startsWith: TEST_PREFIX } } },
        ...(testClientIds.length ? [{ entityId: { in: testClientIds } }] : []),
      ],
    },
  });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { actor: { email: { startsWith: TEST_PREFIX } } },
        ...(testClientIds.length ? [{ entityId: { in: testClientIds } }] : []),
      ],
    },
  });
  await prisma.employeeTask.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.clientStageHistory.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.clientContact.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.project.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.client.deleteMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

describe("client journey stage gate (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const [manager, specialist] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Journey Test Manager",
          email: `${TEST_PREFIX}-manager@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.PROJECT_MANAGER,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Journey Test Specialist",
          email: `${TEST_PREFIX}-specialist@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.CREATIVE_SPECIALIST,
        },
        select: { id: true },
      }),
    ]);

    const paymentStageId = await stageIdFor("payment_received");
    const productionStageId = await stageIdFor("in_production");

    const client = await prisma.client.create({
      data: {
        clientName: "Journey Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "FULL_SERVICE_RETAINER",
        currentStageId: paymentStageId,
      },
      select: { id: true },
    });

    fixtures = {
      clientId: client.id,
      managerId: manager.id,
      specialistId: specialist.id,
      paymentStageId,
      productionStageId,
    };
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("blocks a move into In Production and names every unmet requirement", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const result = await moveClientStage({
      clientId: fixtures!.clientId,
      targetStageId: fixtures!.productionStageId,
      actor,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;

    assert.equal(result.code, "BLOCKED");

    const blockedKeys = (result.blocking ?? []).map((item) => item.key).sort();
    assert.deepEqual(blockedKeys, [
      "account_owner_assigned",
      "contract_recorded",
      "critical_access_collected",
      "payment_confirmed",
      "project_exists",
      "project_manager_assigned",
      "work_assigned",
    ]);

    // The policy, not just today's list: a requirement may only block when the
    // app actually offers a way to satisfy it. Enforcing a rule nobody can
    // comply with just trains people to override. As each module ships, its
    // remedy loses `notBuiltYet` and the gate tightens on its own.
    for (const blocked of result.blocking ?? []) {
      assert.equal(
        getRequirementRemedy(blocked.key).notBuiltYet ?? false,
        false,
        `"${blocked.key}" blocks the move but cannot be resolved anywhere in the app`,
      );
    }

    // The account did not move.
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: fixtures!.clientId },
      select: { currentStageId: true },
    });
    assert.equal(client.currentStageId, fixtures!.paymentStageId);
  });

  it("refuses an override from someone without the permission", async () => {
    const specialist = await loadAuthContext(fixtures!.specialistId);
    assert.ok(specialist);

    const result = await moveClientStage({
      clientId: fixtures!.clientId,
      targetStageId: fixtures!.productionStageId,
      actor: specialist,
      override: { reason: "We need to start production today.", riskAcknowledged: true },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;

    // A copywriter cannot even move stages, let alone override a gate.
    assert.equal(result.code, "FORBIDDEN");
  });

  it("rejects an override with a throwaway reason", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const result = await moveClientStage({
      clientId: fixtures!.clientId,
      targetStageId: fixtures!.productionStageId,
      actor,
      override: { reason: "asap", riskAcknowledged: true },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "OVERRIDE_INVALID");
  });

  it("rejects an override where the risk was not acknowledged", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const result = await moveClientStage({
      clientId: fixtures!.clientId,
      targetStageId: fixtures!.productionStageId,
      actor,
      override: {
        reason: "Client insisted we begin production before the contract is filed.",
        riskAcknowledged: false,
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "OVERRIDE_INVALID");
  });

  it("records a valid override with its reason, approver, and unmet requirements", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const reason = "Client signed verbally; paperwork follows this week. Approved by the director.";

    const result = await moveClientStage({
      clientId: fixtures!.clientId,
      targetStageId: fixtures!.productionStageId,
      actor,
      override: { reason, riskAcknowledged: true },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.wasOverridden, true);

    const history = await prisma.clientStageHistory.findFirstOrThrow({
      where: { clientId: fixtures!.clientId, toStageId: fixtures!.productionStageId },
      orderBy: { changedAt: "desc" },
    });

    assert.equal(history.wasOverridden, true);
    assert.equal(history.overrideReason, reason);
    assert.equal(history.overrideApprovedById, fixtures!.managerId);
    assert.equal(history.overrideRiskAcknowledged, true);
    assert.ok(Array.isArray(history.unmetRequirements));
    assert.equal((history.unmetRequirements as unknown[]).length, 8);

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: fixtures!.clientId },
      select: { currentStageId: true, stageEnteredAt: true },
    });
    assert.equal(client.currentStageId, fixtures!.productionStageId);
    assert.ok(client.stageEnteredAt instanceof Date);
  });

  it("writes an audit entry carrying the before and after stage", async () => {
    const entry = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: fixtures!.clientId, entityType: "PIPELINE" },
      orderBy: { createdAt: "desc" },
    });

    assert.equal(entry.fieldName, "currentStageId");
    assert.equal(entry.previousValue, "Payment Received");
    assert.equal(entry.newValue, "In Production");
    assert.match(entry.action, /overriding/);
  });

  it("notifies oversight roles that a gate was overridden", async () => {
    const overrideNotifications = await prisma.notification.findMany({
      where: { entityId: fixtures!.clientId, type: "STAGE_OVERRIDE" },
      select: { urgency: true, body: true, recipientId: true },
    });

    assert.ok(
      overrideNotifications.length > 0,
      "an override must notify the people who can audit it",
    );
    assert.ok(overrideNotifications.every((item) => item.urgency === "CRITICAL"));
    // The person who performed the override is not notified about their own action.
    assert.ok(overrideNotifications.every((item) => item.recipientId !== fixtures!.managerId));
  });

  it("generates the stage's follow-up work on a clean move", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    // Internal QA only requires production work to be complete, and this
    // account has none, so the gate passes without an override.
    const qaStageId = await stageIdFor("internal_quality_assurance");

    const result = await moveClientStage({
      clientId: fixtures!.clientId,
      targetStageId: qaStageId,
      actor,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.wasOverridden, false);
    assert.equal(result.createdTaskCount, 1);

    const generated = await prisma.employeeTask.findMany({
      where: { clientId: fixtures!.clientId, category: "QUALITY_ASSURANCE" },
      select: { title: true, assignedToId: true, requiresQa: true, priority: true },
    });

    assert.equal(generated.length, 1);
    assert.equal(generated[0].requiresQa, true);
    assert.equal(generated[0].priority, "CRITICAL");
    // Automation must never leave generated work unowned.
    assert.ok(generated[0].assignedToId);
  });

  it("treats a move to the current stage as a no-op", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const qaStageId = await stageIdFor("internal_quality_assurance");
    const before = await prisma.clientStageHistory.count({
      where: { clientId: fixtures!.clientId },
    });

    const result = await moveClientStage({
      clientId: fixtures!.clientId,
      targetStageId: qaStageId,
      actor,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.noChange, true);

    const after = await prisma.clientStageHistory.count({
      where: { clientId: fixtures!.clientId },
    });
    assert.equal(after, before, "a no-op must not write a history entry");
  });

  it("refuses to move an account into a retired stage", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const retired = await prisma.pipelineStage.findFirstOrThrow({
      where: { isDeprecated: true },
      select: { id: true },
    });

    const result = await moveClientStage({
      clientId: fixtures!.clientId,
      targetStageId: retired.id,
      actor,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "STAGE_DEPRECATED");
  });

  it("refuses to move an account into another pipeline's stage", async () => {
    const actor = await loadAuthContext(fixtures!.managerId);
    assert.ok(actor);

    const salesStage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "qualified", pipeline: { kind: "SALES" } },
      select: { id: true },
    });

    const result = await moveClientStage({
      clientId: fixtures!.clientId,
      targetStageId: salesStage.id,
      actor,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "PIPELINE_MISMATCH");
  });
});
