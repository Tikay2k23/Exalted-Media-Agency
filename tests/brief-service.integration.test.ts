import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { prisma } from "@/lib/prisma";
import {
  REQUIRED_BRIEF_FIELDS,
  approveBrief,
  requestBriefRevision,
  saveBrief,
  submitBriefForReview,
} from "@/lib/strategy/brief-service";

const TEST_PREFIX = "zz-brief-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let ownerId = "";
let specialistId = "";

const fullBrief = Object.fromEntries(
  REQUIRED_BRIEF_FIELDS.map((field) => [field.key, `An answer for ${field.label}.`]),
);

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.strategyBrief.deleteMany({ where: { clientId: { in: ids } } });
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

async function briefBlocks() {
  const stage = await prisma.pipelineStage.findFirstOrThrow({
    where: { stageKey: "in_production", isDeprecated: false },
    select: {
      requirements: {
        select: { requirementKey: true, label: true, isBlocking: true },
        orderBy: { position: "asc" },
      },
    },
  });

  const client = await loadClientForEvaluation(clientId);
  assert.ok(client);

  return evaluateStageRequirements(client, stage.requirements).blocking.some(
    (item) => item.key === "strategy_brief_approved",
  );
}

describe("strategy brief (integration)", { skip: !hasDatabase }, () => {
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

    const [pm, owner, specialist] = await Promise.all([
      makeUser("Brief Test PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("Brief Test Owner", "owner", TeamRole.AGENCY_OWNER),
      makeUser("Brief Test Specialist", "specialist", TeamRole.CREATIVE_SPECIALIST),
    ]);

    pmId = pm.id;
    ownerId = owner.id;
    specialistId = specialist.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "strategy_and_planning", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Brief Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "FULL_SERVICE_RETAINER",
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

  it("refuses brief editing to a specialist", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await saveBrief({
      actor: specialist,
      clientId,
      data: { primaryGoal: "Get more leads" },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("blocks production while no brief exists", async () => {
    assert.equal(await briefBlocks(), true);
  });

  it("saves a half-written brief without complaint", async () => {
    // Somebody should be able to start the brief and come back to it.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveBrief({
      actor: pm,
      clientId,
      data: { primaryGoal: "Thirty qualified appointments a month." },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.brief.status, "DRAFT");
    assert.equal(result.brief.authorId, pmId);
  });

  it("refuses to send an incomplete brief for approval, and says what is missing", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await submitBriefForReview({ actor: pm, clientId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INCOMPLETE");
    assert.ok((result.missing ?? []).length > 0);
    assert.ok((result.missing ?? []).some((item) => /audience/i.test(item)));
  });

  it("sends a complete brief for approval", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    await saveBrief({ actor: pm, clientId, data: fullBrief });

    const result = await submitBriefForReview({ actor: pm, clientId });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.brief.status, "IN_REVIEW");
  });

  it("still blocks production while the brief is only in review", async () => {
    assert.equal(await briefBlocks(), true);
  });

  it("refuses to let the author approve their own brief", async () => {
    // Same principle as closing your own defect: a plan nobody else agreed to
    // is not an agreement.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await approveBrief({ actor: pm, clientId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "SELF_APPROVAL");
  });

  it("lets somebody else send it back with a reason", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await requestBriefRevision({
      actor: owner,
      clientId,
      reason: "The success metrics are not measurable as written.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.brief.status, "NEEDS_REVISION");

    const notified = await prisma.notification.findMany({
      where: { entityId: clientId, recipientId: pmId },
      select: { title: true, body: true },
    });
    assert.ok(notified.some((item) => /needs changes/i.test(item.title)));
  });

  it("refuses to send it back with no reason", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await requestBriefRevision({ actor: owner, clientId, reason: "   " });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("clears the gate once somebody else approves it", async () => {
    const pm = await loadAuthContext(pmId);
    const owner = await loadAuthContext(ownerId);
    assert.ok(pm && owner);

    await submitBriefForReview({ actor: pm, clientId });

    const result = await approveBrief({ actor: owner, clientId });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.brief.status, "APPROVED");
    assert.equal(result.brief.approvedById, ownerId);
    assert.ok(result.brief.approvedAt);

    assert.equal(await briefBlocks(), false);
  });

  it("refuses to approve the same brief twice", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await approveBrief({ actor: owner, clientId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("sends an approved brief back for revision when it is edited", async () => {
    // Production is gated on the approval, so quietly changing the plan
    // underneath it would make that approval meaningless.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveBrief({
      actor: pm,
      clientId,
      data: { primaryGoal: "Changed my mind about the goal." },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.returnedForRevision, true);
    assert.equal(result.brief.status, "NEEDS_REVISION");
    assert.equal(result.brief.approvedById, null);

    // And production is blocked again.
    assert.equal(await briefBlocks(), true);
  });

  it("does not let an approved but emptied brief satisfy the gate", async () => {
    // Belt and braces: the gate re-checks completeness rather than trusting
    // the status, in case an approval ever reaches the database another way.
    await prisma.strategyBrief.update({
      where: { clientId },
      data: { status: "APPROVED", targetAudience: null },
    });

    assert.equal(await briefBlocks(), true);
  });
});
