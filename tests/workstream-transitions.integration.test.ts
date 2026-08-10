import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { syncWorkstreams } from "@/lib/workflow/workstream-service";
import {
  assignWorkstream,
  moveWorkstream,
} from "@/lib/workflow/workstream-transitions";

const TEST_PREFIX = "zz-board-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let automationId = "";
let otherAutomationId = "";
let creativeId = "";
let automationStreamId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.clientWorkstream.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientHandoff.deleteMany({ where: { clientId: { in: ids } } });
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

describe("role boards (integration)", { skip: !hasDatabase }, () => {
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

    const [pm, automation, otherAutomation, creative] = await Promise.all([
      makeUser("Board PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("Board Automation", "automation", TeamRole.AUTOMATION_SPECIALIST),
      makeUser("Board Automation Two", "automation2", TeamRole.AUTOMATION_SPECIALIST),
      makeUser("Board Creative", "creative", TeamRole.CREATIVE_SPECIALIST),
    ]);

    pmId = pm.id;
    automationId = automation.id;
    otherAutomationId = otherAutomation.id;
    creativeId = creative.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "in_production", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Board Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        // Funnel build needs creative and automation, so the sync rule has two
        // seats to wait for rather than one.
        serviceType: "FUNNEL_BUILD",
        currentStageId: stage.id,
        assignedUserId: pm.id,
      },
      select: { id: true },
    });

    clientId = client.id;

    await syncWorkstreams({
      clientId,
      service: "FUNNEL_BUILD",
      owners: {
        PROJECT_MANAGER: pmId,
        AUTOMATION_SPECIALIST: automationId,
        CREATIVE_SPECIALIST: creativeId,
      },
    });

    const stream = await prisma.clientWorkstream.findUniqueOrThrow({
      where: { clientId_role: { clientId, role: "AUTOMATION_SPECIALIST" } },
      select: { id: true },
    });

    automationStreamId = stream.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("refuses to let somebody move another person's card", async () => {
    const other = await loadAuthContext(otherAutomationId);
    assert.ok(other);

    const result = await moveWorkstream({
      actor: other,
      workstreamId: automationStreamId,
      stage: "IN_PROGRESS",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("lets the owner move their own card", async () => {
    const automation = await loadAuthContext(automationId);
    assert.ok(automation);

    const result = await moveWorkstream({
      actor: automation,
      workstreamId: automationStreamId,
      stage: "IN_PROGRESS",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.workstream.stage, "IN_PROGRESS");
    assert.ok(result.workstream.startedAt);
  });

  it("lets a project manager move anybody's card", async () => {
    // Rebalancing the board is the normal way work gets unstuck.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await moveWorkstream({
      actor: pm,
      workstreamId: automationStreamId,
      stage: "READY",
    });

    assert.equal(result.ok, true);
  });

  it("refuses to park work as waiting without saying what for", async () => {
    // A card parked with no reason is one nobody chases.
    const automation = await loadAuthContext(automationId);
    assert.ok(automation);

    const result = await moveWorkstream({
      actor: automation,
      workstreamId: automationStreamId,
      stage: "WAITING_ON_ACCESS",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "BLOCKER_REQUIRED");
  });

  it("parks it with a reason, and tells the project manager what to chase", async () => {
    const automation = await loadAuthContext(automationId);
    assert.ok(automation);

    const result = await moveWorkstream({
      actor: automation,
      workstreamId: automationStreamId,
      stage: "WAITING_ON_ACCESS",
      blockedReason: "No GoHighLevel agency access yet.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.workstream.blockedReason, "No GoHighLevel agency access yet.");

    const notified = await prisma.notification.findMany({
      where: { entityId: clientId, recipientId: pmId },
      select: { title: true, body: true },
    });

    assert.ok(notified.some((item) => /holding up/i.test(item.title)));
    assert.ok(notified.some((item) => /GoHighLevel/i.test(item.body ?? "")));
  });

  it("clears the reason when the work starts moving again", async () => {
    const automation = await loadAuthContext(automationId);
    assert.ok(automation);

    const result = await moveWorkstream({
      actor: automation,
      workstreamId: automationStreamId,
      stage: "IN_PROGRESS",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.workstream.blockedReason, null);
  });

  it("refuses to retire a seat from the board", async () => {
    // Whether a seat is needed comes from the purchased service.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await moveWorkstream({
      actor: pm,
      workstreamId: automationStreamId,
      stage: "NOT_REQUIRED" as never,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("does not advance the account while one specialist is still building", async () => {
    const automation = await loadAuthContext(automationId);
    assert.ok(automation);

    const result = await moveWorkstream({
      actor: automation,
      workstreamId: automationStreamId,
      stage: "SELF_REVIEW",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Creative has not finished, so there is nothing to propose yet.
    assert.equal(result.journeyMoved, null);

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { currentStage: { select: { stageKey: true } } },
    });

    assert.equal(client.currentStage.stageKey, "in_production");
  });

  it("does not exercise a permission the specialist does not have", async () => {
    // Both specialists are now finished, so the board wants the account in QA.
    // But moving accounts is the project manager's job, and a creative
    // specialist holds no journey.move. The account waits and the project
    // manager is told, rather than the board quietly using authority its user
    // does not have.
    const creative = await loadAuthContext(creativeId);
    assert.ok(creative);

    const creativeStream = await prisma.clientWorkstream.findUniqueOrThrow({
      where: { clientId_role: { clientId, role: "CREATIVE_SPECIALIST" } },
      select: { id: true },
    });

    const result = await moveWorkstream({
      actor: creative,
      workstreamId: creativeStream.id,
      stage: "READY_TO_SHIP",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.ok(result.journeyMoved, "the board should have proposed a move");
    assert.equal(result.journeyMoved?.stageKey, "internal_quality_assurance");
    assert.equal(result.journeyMoved?.moved, false);
    assert.equal(result.journeyMoved?.awaitingApproval, true);

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { currentStage: { select: { stageKey: true } } },
    });

    // Still exactly where it was.
    assert.equal(client.currentStage.stageKey, "in_production");
  });

  it("tells the project manager the account is ready to move", async () => {
    const notified = await prisma.notification.findMany({
      where: { entityId: clientId, recipientId: pmId },
      select: { title: true },
    });

    assert.ok(notified.some((item) => /ready to move on/i.test(item.title)));
  });

  it("will not push the account past an unmet stage gate", async () => {
    // Now somebody who *can* move accounts touches the board, with real
    // production work still open. The gate refuses and names it, rather than
    // letting a board move carry the account past a requirement.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    await prisma.employeeTask.create({
      data: {
        title: `${TEST_PREFIX} landing page copy`,
        assignedToId: creativeId,
        clientId,
        category: "COPYWRITING",
        status: "IN_PROGRESS",
        dueDate: new Date(),
        weekStartDate: new Date(),
      },
    });

    const result = await moveWorkstream({
      actor: pm,
      workstreamId: automationStreamId,
      stage: "READY_TO_SHIP",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.journeyMoved?.moved, false);
    assert.ok(
      (result.journeyMoved?.blockedBy ?? []).length > 0,
      "a refusal must name the requirements rather than failing silently",
    );

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { currentStage: { select: { stageKey: true } } },
    });

    assert.equal(client.currentStage.stageKey, "in_production");
  });

  it("advances the account once the gate is genuinely satisfied", async () => {
    // Close the production work the gate was waiting on, then nudge the board.
    await prisma.employeeTask.updateMany({
      where: { clientId },
      data: { status: "DONE" },
    });

    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await moveWorkstream({
      actor: pm,
      workstreamId: automationStreamId,
      stage: "SELF_REVIEW",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.journeyMoved?.moved, true);

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { currentStage: { select: { stageKey: true } } },
    });

    assert.equal(client.currentStage.stageKey, "internal_quality_assurance");
  });

  it("refuses to put somebody in a seat they do not hold", async () => {
    // Otherwise the board lies about who does what.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await assignWorkstream({
      actor: pm,
      workstreamId: automationStreamId,
      ownerId: creativeId,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("reassigns within the seat", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await assignWorkstream({
      actor: pm,
      workstreamId: automationStreamId,
      ownerId: otherAutomationId,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.workstream.ownerId, otherAutomationId);
  });
});
