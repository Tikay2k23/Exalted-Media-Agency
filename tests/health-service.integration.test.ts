import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { prisma } from "@/lib/prisma";
import {
  raiseComplaint,
  recordHealthAssessment,
  saveRecoveryPlan,
  updateComplaint,
} from "@/lib/success/health-service";

const TEST_PREFIX = "zz-health-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let specialistId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.clientHealthAssessment.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.complaint.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.recoveryPlan.deleteMany({ where: { clientId: { in: ids } } });
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

async function healthBlocks() {
  const stage = await prisma.pipelineStage.findFirstOrThrow({
    where: { stageKey: "ongoing_management", isDeprecated: false },
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
    (item) => item.key === "health_assessed",
  );
}

describe("client health (integration)", { skip: !hasDatabase }, () => {
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
      makeUser("Health Test PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("Health Test Specialist", "specialist", TeamRole.ADS_SPECIALIST),
    ]);

    pmId = pm.id;
    specialistId = specialist.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "live_active", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Health Test Contact",
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

  it("refuses assessment to a specialist", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await recordHealthAssessment({
      actor: specialist,
      clientId,
      status: "GREEN",
      summary: "Everything looks fine to me from over here.",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("blocks ongoing management while nothing is assessed", async () => {
    assert.equal(await healthBlocks(), true);
  });

  it("refuses a colour with no reasoning", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordHealthAssessment({
      actor: pm,
      clientId,
      status: "GREEN",
      summary: "fine",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("refuses NOT_ASSESSED as an assessment", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordHealthAssessment({
      actor: pm,
      clientId,
      status: "NOT_ASSESSED",
      summary: "I would rather not say either way just yet.",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("refuses a score outside 0-100", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordHealthAssessment({
      actor: pm,
      clientId,
      status: "GREEN",
      summary: "Delivery is on track and they are responsive.",
      healthScore: 140,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("records a green assessment and opens the gate", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordHealthAssessment({
      actor: pm,
      clientId,
      status: "GREEN",
      summary: "Delivery is on track, they reply quickly, invoices are paid.",
      healthScore: 82,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.assessment.assessedById, pmId);

    // The field follows the assessment.
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { healthStatus: true },
    });
    assert.equal(client.healthStatus, "GREEN");

    assert.equal(await healthBlocks(), false);
  });

  it("refuses red without a recovery plan", async () => {
    // Marking an account as about to leave and doing nothing is worse than not
    // noticing, because it looks like it was handled.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordHealthAssessment({
      actor: pm,
      clientId,
      status: "RED",
      summary: "They have gone quiet and mentioned cancelling on the last call.",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "RECOVERY_PLAN_REQUIRED");
  });

  it("allows yellow without a plan", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordHealthAssessment({
      actor: pm,
      clientId,
      status: "YELLOW",
      summary: "Slower replies than usual and one missed approval deadline.",
    });

    assert.equal(result.ok, true);
  });

  it("refuses a recovery plan missing any of its three parts", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveRecoveryPlan({
      actor: pm,
      clientId,
      trigger: "They are unhappy",
      objective: "",
      actions: "Talk to them",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("accepts red once a plan exists", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const plan = await saveRecoveryPlan({
      actor: pm,
      clientId,
      trigger: "Two missed reports and a cancellation threat on the 6 Aug call.",
      objective: "Reporting back on schedule and a signed renewal intent by September.",
      actions: "Owner joins the next call; reporting moves to Mondays; weekly check-in.",
    });

    assert.equal(plan.ok, true);

    const result = await recordHealthAssessment({
      actor: pm,
      clientId,
      status: "RED",
      summary: "They have gone quiet and mentioned cancelling on the last call.",
      cancellationThreat: true,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.assessment.cancellationThreat, true);
  });

  it("alerts leadership when an account turns red", async () => {
    const notified = await prisma.notification.findMany({
      where: { entityId: clientId, urgency: "CRITICAL" },
      select: { title: true },
    });

    assert.ok(notified.some((item) => /is now red/i.test(item.title)));
  });

  it("counts open complaints onto the assessment rather than trusting a typed number", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const complaint = await raiseComplaint({
      actor: pm,
      clientId,
      title: "August report arrived nine days late",
      description: "The monthly report was promised on the 3rd and arrived on the 12th.",
    });

    assert.equal(complaint.ok, true);

    const assessment = await recordHealthAssessment({
      actor: pm,
      clientId,
      status: "RED",
      summary: "Still red: the late report has not been explained to them yet.",
    });

    assert.equal(assessment.ok, true);
    if (!assessment.ok) return;
    assert.equal(assessment.assessment.openComplaints, 1);
  });

  it("refuses to resolve a complaint with no outcome written down", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const complaint = await prisma.complaint.findFirstOrThrow({
      where: { clientId },
      select: { id: true },
    });

    const result = await updateComplaint({
      actor: pm,
      complaintId: complaint.id,
      status: "RESOLVED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("resolves a complaint when the outcome is recorded", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const complaint = await prisma.complaint.findFirstOrThrow({
      where: { clientId },
      select: { id: true },
    });

    const result = await updateComplaint({
      actor: pm,
      complaintId: complaint.id,
      status: "RESOLVED",
      finalOutcome: "Apologised on a call, moved reporting to Mondays, no repeat since.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.complaint.resolvedAt);
  });

  it("refuses to close a recovery plan without recording what happened", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const plan = await prisma.recoveryPlan.findFirstOrThrow({
      where: { clientId },
      select: { id: true, trigger: true, objective: true, actions: true },
    });

    const result = await saveRecoveryPlan({
      actor: pm,
      clientId,
      planId: plan.id,
      trigger: plan.trigger,
      objective: plan.objective,
      actions: plan.actions,
      status: "SUCCEEDED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("keeps the whole assessment history rather than overwriting a status", async () => {
    const history = await prisma.clientHealthAssessment.findMany({
      where: { clientId },
      orderBy: { assessedAt: "asc" },
      select: { status: true },
    });

    // Green, yellow, red, red - the account's story, not just where it landed.
    assert.ok(history.length >= 4);
    assert.equal(history[0].status, "GREEN");
  });

  it("does not let a status with no assessment behind it satisfy the gate", async () => {
    // Belt and braces, same as the brief and the approval register.
    await prisma.clientHealthAssessment.deleteMany({ where: { clientId } });

    assert.equal(await healthBlocks(), true);
  });
});
