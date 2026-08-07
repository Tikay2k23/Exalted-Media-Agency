import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { prisma } from "@/lib/prisma";
import {
  addQaTest,
  closeDefect,
  createDefect,
  createQaPlan,
  recordTestResult,
  updateDefect,
} from "@/lib/quality/defect-service";

const TEST_PREFIX = "zz-defect-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let builderId = "";
let ownerId = "";
let criticalDefectId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);
  const plans = await prisma.qaPlan.findMany({
    where: { clientId: { in: ids } },
    select: { id: true },
  });

  await prisma.qaTest.deleteMany({
    where: { planId: { in: plans.map((plan) => plan.id) } },
  });
  await prisma.employeeTask.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.defect.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.qaPlan.deleteMany({ where: { clientId: { in: ids } } });
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

async function criticalDefectsBlock() {
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

  return evaluateStageRequirements(client, stage.requirements).blocking.some(
    (item) => item.key === "critical_defects_closed",
  );
}

describe("defect tracker (integration)", { skip: !hasDatabase }, () => {
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

    const [pm, builder, owner] = await Promise.all([
      makeUser("Defect Test PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("Defect Test Builder", "builder", TeamRole.CREATIVE_SPECIALIST),
      makeUser("Defect Test Owner", "owner", TeamRole.AGENCY_OWNER),
    ]);

    pmId = pm.id;
    builderId = builder.id;
    ownerId = owner.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "internal_quality_assurance", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Defect Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "WEBSITE_SUPPORT",
        currentStageId: stage.id,
        assignedUserId: pm.id,
      },
      select: { id: true },
    });

    clientId = client.id;

    // The builder works this account through an assigned work item rather than
    // owning the relationship, which is the normal arrangement.
    await prisma.employeeTask.create({
      data: {
        title: `${TEST_PREFIX} build the contact page`,
        assignedToId: builder.id,
        clientId: client.id,
        dueDate: new Date(),
        weekStartDate: new Date(),
        status: "IN_PROGRESS",
      },
    });
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("lets a specialist raise a defect against someone else's work", async () => {
    // Anyone who can test must be able to say something is wrong, or defects
    // only ever get raised by the person least likely to spot them.
    const builder = await loadAuthContext(builderId);
    assert.ok(builder);

    const result = await createDefect({
      actor: builder,
      clientId,
      data: {
        title: "Contact form does not send",
        severity: "CRITICAL",
        description: "Submitting the contact form shows a spinner and never completes.",
        assignedToId: builderId,
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    criticalDefectId = result.defect.id;
    assert.match(result.defect.reference, /^DEF-\d{6}$/);
    assert.equal(result.defect.status, "ASSIGNED");
  });

  it("blocks Ready for Launch while a critical defect is open", async () => {
    assert.equal(await criticalDefectsBlock(), true);
  });

  it("refuses to close a defect through a plain status update", async () => {
    // Otherwise the self-verification rule could be sidestepped entirely.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await updateDefect({
      actor: pm,
      defectId: criticalDefectId,
      data: { status: "CLOSED" },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
    assert.match(result.message, /close action/i);
  });

  it("refuses to let the builder close their own defect", async () => {
    const builder = await loadAuthContext(builderId);
    assert.ok(builder);

    const result = await closeDefect({
      actor: builder,
      defectId: criticalDefectId,
      resolution: "CLOSED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    // A creative specialist holds qa.test but not qa.closeDefect.
    assert.equal(result.code, "FORBIDDEN");
  });

  it("lets an independent reviewer close it, with no override recorded", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await closeDefect({
      actor: pm,
      defectId: criticalDefectId,
      resolution: "CLOSED",
      retestResult: "Retested on staging, submission arrives.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.selfVerified, false);

    const stored = await prisma.defect.findUniqueOrThrow({
      where: { id: criticalDefectId },
      select: { verifiedById: true, closedAt: true, closureOverrideReason: true },
    });

    assert.equal(stored.verifiedById, pmId);
    assert.ok(stored.closedAt);
    assert.equal(stored.closureOverrideReason, null);
  });

  it("clears the gate once the critical defect is closed", async () => {
    assert.equal(await criticalDefectsBlock(), false);
  });

  it("refuses a reviewer closing their own work without a reason", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const raised = await createDefect({
      actor: pm,
      clientId,
      data: {
        title: "Tracking not firing on thank you page",
        severity: "HIGH",
        description: "No conversion event recorded after submission.",
        assignedToId: pmId,
      },
    });
    assert.equal(raised.ok, true);
    if (!raised.ok) return;

    const result = await closeDefect({
      actor: pm,
      defectId: raised.defect.id,
      resolution: "CLOSED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "SELF_VERIFICATION");
  });

  it("allows self-closure with a recorded reason, and tells leadership", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const defect = await prisma.defect.findFirstOrThrow({
      where: { clientId, assignedToId: pmId, closedAt: null },
      select: { id: true, reference: true },
    });

    const reason = "Only reviewer available before the launch window; retested twice.";

    const result = await closeDefect({
      actor: pm,
      defectId: defect.id,
      resolution: "CLOSED",
      overrideReason: reason,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.selfVerified, true);

    const stored = await prisma.defect.findUniqueOrThrow({
      where: { id: defect.id },
      select: { closureOverrideReason: true },
    });
    assert.equal(stored.closureOverrideReason, reason);

    // Self-verification is a governance event, so it is surfaced.
    const notified = await prisma.notification.findMany({
      where: { entityId: clientId, recipientId: ownerId },
      select: { title: true },
    });
    assert.ok(notified.some((item) => /closed their own defect/.test(item.title)));
  });

  it("refuses to close a defect twice", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await closeDefect({
      actor: pm,
      defectId: criticalDefectId,
      resolution: "CLOSED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "ALREADY_CLOSED");
  });

  it("numbers defects sequentially", async () => {
    const references = await prisma.defect.findMany({
      where: { clientId },
      orderBy: { reference: "asc" },
      select: { reference: true },
    });

    assert.ok(references.length >= 2);
    assert.equal(new Set(references.map((row) => row.reference)).size, references.length);
  });

  it("records a test plan and refuses a failed test with no actual result", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const plan = await createQaPlan({
      actor: pm,
      clientId,
      data: { name: "Pre-launch QA", deliverable: "Marketing website" },
    });
    assert.equal(plan.ok, true);
    if (!plan.ok) return;

    const test = await addQaTest({
      actor: pm,
      planId: plan.plan.id,
      data: {
        objective: "Contact form submits",
        steps: "Open the contact page and submit the form.",
        expectedResult: "A confirmation shows and the lead arrives.",
      },
    });
    assert.equal(test.ok, true);
    if (!test.ok) return;

    const failing = await recordTestResult({
      actor: pm,
      testId: test.test.id,
      status: "FAILED",
    });

    assert.equal(failing.ok, false);
    if (failing.ok) return;
    assert.equal(failing.code, "INVALID");

    const passing = await recordTestResult({
      actor: pm,
      testId: test.test.id,
      status: "PASSED",
      actualResult: "Confirmation shown, lead received.",
    });

    assert.equal(passing.ok, true);
    if (!passing.ok) return;
    assert.equal(passing.test.testerId, pmId);
    assert.ok(passing.test.executedAt);
  });
});
