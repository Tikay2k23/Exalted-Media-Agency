import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ClientStatus, OffboardingStatus, Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isActive } from "@/lib/clients/client-workspace";
import { OFFBOARDING_STEPS, saveOffboarding } from "@/lib/success/offboarding-service";

/**
 * Completing offboarding has to end the engagement.
 *
 * It did not. The offboarding record read COMPLETE and the client stayed
 * ACTIVE, so a finished account kept turning up on the board, in the
 * directory and in the portfolio counts, with nothing anywhere that would
 * ever have moved it - archive does not exist yet.
 *
 * These run against the development database and skip without one.
 */

const TEST_PREFIX = "zz-offboarding-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let ownerId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.offboardingRecord.deleteMany({ where: { clientId: { in: ids } } });
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

async function statusOf() {
  const row = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    select: { status: true },
  });

  return row.status;
}

describe("offboarding completion (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const owner = await prisma.user.create({
      data: {
        name: "Offboarding Test Owner",
        email: `${TEST_PREFIX}-owner@example.test`,
        passwordHash: "not-a-real-hash",
        role: Role.ADMIN,
        teamRole: TeamRole.PROJECT_MANAGER,
      },
      select: { id: true },
    });

    ownerId = owner.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "live_active", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Offboarding Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "SEO",
        currentStageId: stage.id,
        assignedUserId: owner.id,
        status: ClientStatus.ACTIVE,
      },
      select: { id: true },
    });

    clientId = client.id;
  });

  after(cleanup);

  it("leaves the account active while offboarding is only started", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    const started = await saveOffboarding({
      actor,
      clientId,
      reason: "CONTRACT_ENDED",
      status: OffboardingStatus.REQUESTED,
    });

    assert.equal(started.ok, true);
    /* Started is not finished: the work is still somebody's to do. */
    assert.equal(await statusOf(), ClientStatus.ACTIVE);
  });

  it("refuses to complete while anything blocking is outstanding, and names it", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    const early = await saveOffboarding({
      actor,
      clientId,
      status: OffboardingStatus.COMPLETE,
    });

    assert.equal(early.ok, false);

    if (early.ok) return;

    assert.equal(early.code, "INCOMPLETE");
    assert.ok((early.outstanding ?? []).length > 0, "should say what is outstanding");
    assert.equal(await statusOf(), ClientStatus.ACTIVE, "a refused completion changes nothing");
  });

  it("ends the engagement once every step is done", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    const ticked = await saveOffboarding({
      actor,
      clientId,
      status: OffboardingStatus.IN_PROGRESS,
      remainingWork: "None outstanding",
      completeSteps: OFFBOARDING_STEPS.map((step) => step.key),
    });

    assert.equal(ticked.ok, true);
    assert.equal(await statusOf(), ClientStatus.ACTIVE, "ticking steps is not completing");

    const finished = await saveOffboarding({
      actor,
      clientId,
      status: OffboardingStatus.COMPLETE,
    });

    assert.equal(finished.ok, true);

    const status = await statusOf();

    assert.equal(status, ClientStatus.COMPLETED);
    /* The point of the status change: it drops out of the active views. */
    assert.equal(isActive({ status } as never), false);
  });

  it("records the status change against the client", async () => {
    const logged = await prisma.activityLog.count({
      where: { entityId: clientId, fieldName: "status", newValue: ClientStatus.COMPLETED },
    });

    /* Exactly one - a second completion must not log the change again. */
    assert.equal(logged, 1);
  });

  it("does not log the change twice when completion is saved again", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    await saveOffboarding({ actor, clientId, status: OffboardingStatus.COMPLETE });

    const logged = await prisma.activityLog.count({
      where: { entityId: clientId, fieldName: "status", newValue: ClientStatus.COMPLETED },
    });

    assert.equal(logged, 1);
    assert.equal(await statusOf(), ClientStatus.COMPLETED);
  });
});
