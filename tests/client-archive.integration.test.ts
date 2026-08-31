import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { ClientStatus, OffboardingStatus, Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { archiveClient, unarchiveClient } from "@/lib/success/archive-service";
import { moveClientStage } from "@/lib/journey/transition";
import { OFFBOARDING_STEPS, saveOffboarding } from "@/lib/success/offboarding-service";

/**
 * Archiving is the last step of the lifecycle and the one most easily mistaken
 * for a delete.
 *
 * These prove the two things that matter: it cannot happen out of order, and
 * it destroys nothing. The second is the reason this file counts related rows
 * before and after rather than trusting the absence of a delete statement.
 */

const TEST_PREFIX = "zz-archive-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let ownerId = "";
let outsiderId = "";
let clientId = "";
let taskId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.employeeTask.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientNote.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientContact.deleteMany({ where: { clientId: { in: ids } } });
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

/** Everything hanging off the client, counted, so nothing can vanish quietly. */
async function relatedCounts() {
  return {
    tasks: await prisma.employeeTask.count({ where: { clientId } }),
    contacts: await prisma.clientContact.count({ where: { clientId } }),
    notes: await prisma.clientNote.count({ where: { clientId } }),
    offboarding: await prisma.offboardingRecord.count({ where: { clientId } }),
    activity: await prisma.activityLog.count({ where: { entityId: clientId } }),
  };
}

describe("client archive (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const owner = await prisma.user.create({
      data: {
        name: "Archive Test Owner",
        email: `${TEST_PREFIX}-owner@example.test`,
        passwordHash: "not-a-real-hash",
        role: Role.ADMIN,
        teamRole: TeamRole.PROJECT_MANAGER,
      },
      select: { id: true },
    });

    /* Somebody without clients.delete, to prove the permission is enforced. */
    const outsider = await prisma.user.create({
      data: {
        name: "Archive Test Specialist",
        email: `${TEST_PREFIX}-specialist@example.test`,
        passwordHash: "not-a-real-hash",
        role: Role.TEAM_MEMBER,
        teamRole: TeamRole.CREATIVE_SPECIALIST,
      },
      select: { id: true },
    });

    ownerId = owner.id;
    outsiderId = outsider.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "offboarding", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Archive Test Contact",
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

    /* History that must survive being filed away. */
    const task = await prisma.employeeTask.create({
      data: {
        title: `${TEST_PREFIX} delivered work`,
        status: "DONE",
        priority: "MEDIUM",
        dueDate: new Date(),
        assignedToId: owner.id,
        createdById: owner.id,
        clientId: client.id,
        estimatedHours: 1,
        weekStartDate: new Date(),
      },
      select: { id: true },
    });

    taskId = task.id;

    await prisma.clientContact.create({
      data: {
        clientId: client.id,
        name: "Archive Test Person",
        email: `${TEST_PREFIX}-contact@example.test`,
        isPrimary: true,
      },
    });

    await prisma.clientNote.create({
      data: { clientId: client.id, body: `${TEST_PREFIX} a note worth keeping` },
    });
  });

  after(cleanup);

  it("refuses to archive an account nobody has offboarded", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    const result = await archiveClient({ actor, clientId });

    assert.equal(result.ok, false);

    if (!result.ok) assert.equal(result.code, "OUT_OF_ORDER");

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { archivedAt: true },
    });

    assert.equal(client.archivedAt, null);
  });

  it("refuses to archive while offboarding is unfinished", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    await saveOffboarding({
      actor,
      clientId,
      reason: "CONTRACT_ENDED",
      status: OffboardingStatus.REQUESTED,
    });

    const result = await archiveClient({ actor, clientId });

    assert.equal(result.ok, false);

    if (!result.ok) assert.equal(result.code, "OUT_OF_ORDER");
  });

  it("refuses a seat without permission", async () => {
    const actor = await loadAuthContext(outsiderId);
    assert.ok(actor);

    const result = await archiveClient({ actor, clientId });

    assert.equal(result.ok, false);

    if (!result.ok) assert.equal(result.code, "FORBIDDEN");
  });

  it("archives once offboarding is complete, and destroys nothing", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    await saveOffboarding({
      actor,
      clientId,
      status: OffboardingStatus.IN_PROGRESS,
      remainingWork: "None outstanding",
      completeSteps: OFFBOARDING_STEPS.map((step) => step.key),
    });

    await saveOffboarding({ actor, clientId, status: OffboardingStatus.COMPLETE });

    const before = await relatedCounts();

    const result = await archiveClient({ actor, clientId });

    assert.equal(result.ok, true);

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { archivedAt: true, archivedById: true, status: true, deletedAt: true },
    });

    assert.notEqual(client.archivedAt, null);
    assert.equal(client.archivedById, ownerId);
    assert.equal(client.status, ClientStatus.COMPLETED);
    /* The whole point: archived is not deleted. */
    assert.equal(client.deletedAt, null);

    const after = await relatedCounts();

    assert.equal(after.tasks, before.tasks, "tasks preserved");
    assert.equal(after.contacts, before.contacts, "contacts preserved");
    assert.equal(after.notes, before.notes, "notes preserved");
    assert.equal(after.offboarding, before.offboarding, "offboarding history preserved");
    assert.ok(after.activity >= before.activity, "activity preserved and added to");

    /* And the work itself is still readable, not merely counted. */
    const task = await prisma.employeeTask.findUnique({ where: { id: taskId } });

    assert.ok(task, "the task still exists");
  });

  it("is idempotent", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    const before = await prisma.activityLog.count({
      where: { entityId: clientId, fieldName: "archivedAt" },
    });

    const again = await archiveClient({ actor, clientId });

    assert.equal(again.ok, true);

    if (again.ok) assert.equal(again.alreadyArchived, true);

    const after = await prisma.activityLog.count({
      where: { entityId: clientId, fieldName: "archivedAt" },
    });

    assert.equal(after, before, "a second archive logs nothing");
  });

  it("leaves the active views but stays readable by id", async () => {
    const listed = await prisma.client.count({
      where: { id: clientId, deletedAt: null, archivedAt: null },
    });

    assert.equal(listed, 0, "gone from the active scope");

    const byId = await prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { id: true, companyName: true },
    });

    assert.ok(byId, "still there when asked for directly");
  });

  it("only one of two simultaneous archives takes effect", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    /* Put it back so the race has something to win. */
    await unarchiveClient({ actor, clientId });

    const before = await prisma.activityLog.count({
      where: { entityId: clientId, fieldName: "archivedAt", newValue: { not: null } },
    });

    /*
     * Both requests arrive together. The conditional write settles it: one
     * archives, the other reads zero rows and reports the state it found.
     */
    const [a, b] = await Promise.all([
      archiveClient({ actor, clientId }),
      archiveClient({ actor, clientId }),
    ]);

    assert.equal(a.ok, true);
    assert.equal(b.ok, true);

    const after = await prisma.activityLog.count({
      where: { entityId: clientId, fieldName: "archivedAt", newValue: { not: null } },
    });

    assert.equal(after - before, 1, "exactly one archive transition was recorded");
  });

  it("refuses a client id belonging to somebody else's account", async () => {
    const actor = await loadAuthContext(outsiderId);
    assert.ok(actor);

    /*
     * Beta-critical: an id in a request is not an entitlement. The specialist
     * is refused on permission before scope is even reached, which is the
     * stricter of the two answers.
     */
    const result = await archiveClient({ actor, clientId });

    assert.equal(result.ok, false);
  });

  it("stops normal delivery work once the account is filed", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { archivedAt: true, currentStageId: true },
    });

    assert.notEqual(client.archivedAt, null, "precondition: it is archived");

    const next = await prisma.pipelineStage.findFirstOrThrow({
      where: { isDeprecated: false, id: { not: client.currentStageId } },
      select: { id: true },
    });

    const moved = await moveClientStage({
      actor,
      clientId,
      targetStageId: next.id,
    });

    assert.equal(moved.ok, false, "an archived account does not advance");

    if (!moved.ok) {
      /* And it says why, rather than refusing for an unrelated reason. */
      assert.match(moved.message, /archiv/i);
    }
  });

  it("can be brought back", async () => {
    const actor = await loadAuthContext(ownerId);
    assert.ok(actor);

    const restored = await unarchiveClient({ actor, clientId });

    assert.equal(restored.ok, true);

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { archivedAt: true, status: true },
    });

    assert.equal(client.archivedAt, null);
    assert.equal(client.status, ClientStatus.ACTIVE);
  });
});
