import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import {
  markDependencyReceived,
  raiseJourneyFlag,
  recordFollowUp,
} from "@/lib/journey/flag-service";
import { prisma } from "@/lib/prisma";

const TEST_PREFIX = "zz-chase-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let specialistId = "";
let contactId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.clientJourneyFlag.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientContact.deleteMany({ where: { clientId: { in: ids } } });
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

async function raise(reason: string) {
  const actor = await loadAuthContext(pmId);
  assert.ok(actor);

  const result = await raiseJourneyFlag({
    actor,
    clientId,
    kind: "WAITING_ON_CLIENT",
    reason,
    detail: null,
    responsibleParty: null,
    dueAt: null,
    round: null,
    severity: null,
    impact: null,
    expectedResolutionAt: null,
    requirementKey: null,
    taskId: null,
    contactId,
  });

  assert.equal(result.ok, true, `could not raise: ${JSON.stringify(result)}`);

  return (result as { flagId: string }).flagId;
}

/**
 * Chasing a client, and recording that it happened.
 *
 * The follow-up count and the received date are the two things the chase list
 * reads to decide what to show and in what order. Both are written here, and
 * both have to survive two people clicking at once - the card is on a screen
 * two members of the team can have open on the same account.
 */
describe("chasing a client dependency (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

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

    const [pm, specialist] = await Promise.all([
      makeUser("Chase Test PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("Chase Test Specialist", "specialist", TeamRole.CREATIVE_SPECIALIST),
    ]);

    pmId = pm.id;
    specialistId = specialist.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "onboarding_form_sent", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Chase Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "WEBSITE_SUPPORT",
        currentStageId: stage.id,
        assignedUserId: pm.id,
        contacts: {
          create: [{ name: "Tom Brennan", isPrimary: true, role: "Owner" }],
        },
      },
      select: { id: true, contacts: { select: { id: true } } },
    });

    clientId = client.id;
    contactId = client.contacts[0].id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("records a follow-up against the request that was chased", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const flagId = await raise("Business address confirmation");
    const result = await recordFollowUp({ actor, flagId });

    assert.equal(result.ok, true);

    const stored = await prisma.clientJourneyFlag.findUniqueOrThrow({
      where: { id: flagId },
      select: { followUpCount: true, lastFollowUpAt: true },
    });

    assert.equal(stored.followUpCount, 1);
    assert.notEqual(stored.lastFollowUpAt, null);
  });

  it("refuses a second chase on the same day, so a client is asked once", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const flagId = await raise("Logo files");

    await recordFollowUp({ actor, flagId });
    const second = await recordFollowUp({ actor, flagId });

    assert.equal(second.ok, false);

    const stored = await prisma.clientJourneyFlag.findUniqueOrThrow({
      where: { id: flagId },
      select: { followUpCount: true },
    });

    // The point of the guard: a double-click is one chase, not two.
    assert.equal(stored.followUpCount, 1);
  });

  it("marks a dependency received without resolving it", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const flagId = await raise("Meta Business Manager access");
    const result = await markDependencyReceived({ actor, flagId });

    assert.equal(result.ok, true);

    const stored = await prisma.clientJourneyFlag.findUniqueOrThrow({
      where: { id: flagId },
      select: { receivedAt: true, resolvedAt: true },
    });

    /*
     * Their move is made; ours is not. Collapsing the two would lose the
     * window where a wrong answer sits looking finished.
     */
    assert.notEqual(stored.receivedAt, null);
    assert.equal(stored.resolvedAt, null);
  });

  it("does not let a second person overwrite when the client answered", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const flagId = await raise("Billing contact");

    const first = await markDependencyReceived({ actor, flagId });
    assert.equal(first.ok, true);

    const stamped = await prisma.clientJourneyFlag.findUniqueOrThrow({
      where: { id: flagId },
      select: { receivedAt: true },
    });

    const second = await markDependencyReceived({ actor, flagId });

    assert.equal(second.ok, false);
    assert.match(
      (second as { message: string }).message,
      /already been marked received/i,
    );

    const after = await prisma.clientJourneyFlag.findUniqueOrThrow({
      where: { id: flagId },
      select: { receivedAt: true },
    });

    // The date the client actually answered is not quietly moved to now.
    assert.equal(after.receivedAt?.getTime(), stamped.receivedAt?.getTime());
  });

  it("lets exactly one of eight concurrent clicks through", async () => {
    const actor = await loadAuthContext(pmId);
    assert.ok(actor);

    const flagId = await raise("Domain registrar login");

    /*
     * Eight at once, which is what a jammed button looks like.
     *
     * This is the test that pins the conditional write rather than the status
     * check above it. Relax the update to match on id alone and all eight
     * succeed: the pool runs them genuinely in parallel, so every one of them
     * reads a null receivedAt before any of them writes, and a check made
     * before the write protects nothing. The where clause is the guard.
     */
    const results = await Promise.all(
      Array.from({ length: 8 }, () => markDependencyReceived({ actor, flagId })),
    );

    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.filter((result) => !result.ok).length, 7);
  });

  it("refuses somebody without permission to manage the account", async () => {
    const actor = await loadAuthContext(specialistId);
    assert.ok(actor);

    const flagId = await raise("Brand guidelines");
    const result = await markDependencyReceived({ actor, flagId });

    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, "FORBIDDEN");

    const stored = await prisma.clientJourneyFlag.findUniqueOrThrow({
      where: { id: flagId },
      select: { receivedAt: true },
    });

    // Refused on the server, not merely hidden in the interface.
    assert.equal(stored.receivedAt, null);
  });
});
