import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import {
  addMilestone,
  createProject,
  deriveProjectProgress,
  setMilestoneCompletion,
  updateProject,
} from "@/lib/delivery/project-service";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { prisma } from "@/lib/prisma";

const TEST_PREFIX = "zz-project-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let specialistId = "";
let projectId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  const projects = await prisma.project.findMany({
    where: { clientId: { in: ids } },
    select: { id: true },
  });

  await prisma.milestone.deleteMany({
    where: { projectId: { in: projects.map((project) => project.id) } },
  });
  await prisma.project.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipient: { email: { startsWith: TEST_PREFIX } } },
        ...(ids.length ? [{ entityId: { in: ids } }] : []),
      ],
    },
  });
  await prisma.activityLog.deleteMany({
    where: { actor: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function blockedKeys() {
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

  return evaluateStageRequirements(client, stage.requirements).blocking.map(
    (item) => item.key,
  );
}

describe("delivery projects (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const [pm, specialist] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Project Test PM",
          email: `${TEST_PREFIX}-pm@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.PROJECT_MANAGER,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Project Test Specialist",
          email: `${TEST_PREFIX}-specialist@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.CREATIVE_SPECIALIST,
        },
        select: { id: true },
      }),
    ]);

    pmId = pm.id;
    specialistId = specialist.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "payment_received", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Project Test Contact",
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

  it("refuses project creation to a specialist", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await createProject({
      actor: specialist,
      clientId,
      data: { name: "Unauthorised project" },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("blocks production while no project exists", async () => {
    const blocked = await blockedKeys();

    assert.ok(blocked.includes("project_exists"));
    assert.ok(blocked.includes("project_manager_assigned"));
  });

  it("creates a project and defaults the service to what the client bought", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await createProject({
      actor: pm,
      clientId,
      data: { name: "Website and funnel build" },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    projectId = result.project.id;
    assert.equal(result.project.serviceType, "FULL_SERVICE_RETAINER");
    assert.equal(result.project.status, "PLANNING");
  });

  it("still blocks production while the project has no manager", async () => {
    const blocked = await blockedKeys();

    assert.ok(!blocked.includes("project_exists"), "the project now exists");
    assert.ok(blocked.includes("project_manager_assigned"));
  });

  it("clears both project gates once a manager is assigned", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await updateProject({
      actor: pm,
      projectId,
      data: { projectManagerId: pmId },
    });

    assert.equal(result.ok, true);

    const blocked = await blockedKeys();
    assert.ok(!blocked.includes("project_exists"));
    assert.ok(!blocked.includes("project_manager_assigned"));
  });

  it("appends milestones in order", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    for (const name of ["Discovery", "Build", "Launch"]) {
      const result = await addMilestone({ actor: pm, projectId, data: { name } });
      assert.equal(result.ok, true);
    }

    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      orderBy: { position: "asc" },
      select: { name: true, position: true },
    });

    assert.deepEqual(
      milestones.map((milestone) => milestone.name),
      ["Discovery", "Build", "Launch"],
    );
    assert.deepEqual(
      milestones.map((milestone) => milestone.position),
      [0, 1, 2],
    );
  });

  it("moves progress as milestones are completed, without anyone typing a percentage", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const discovery = await prisma.milestone.findFirstOrThrow({
      where: { projectId, name: "Discovery" },
      select: { id: true },
    });

    await setMilestoneCompletion({ actor: pm, milestoneId: discovery.id, completed: true });

    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      select: { name: true, position: true, dueDate: true, completedAt: true },
    });

    const progress = deriveProjectProgress(milestones);

    assert.equal(progress.percentComplete, 33);
    assert.equal(progress.currentMilestone, "Build");
    assert.equal(progress.nextMilestone, "Launch");
  });

  it("lets a completed milestone be reopened", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const discovery = await prisma.milestone.findFirstOrThrow({
      where: { projectId, name: "Discovery" },
      select: { id: true },
    });

    await setMilestoneCompletion({ actor: pm, milestoneId: discovery.id, completed: false });

    const reopened = await prisma.milestone.findUniqueOrThrow({
      where: { id: discovery.id },
      select: { completedAt: true },
    });

    assert.equal(reopened.completedAt, null);
  });

  it("refuses milestone changes from a specialist", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const milestone = await prisma.milestone.findFirstOrThrow({
      where: { projectId },
      select: { id: true },
    });

    const result = await setMilestoneCompletion({
      actor: specialist,
      milestoneId: milestone.id,
      completed: true,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("records the status change on the audit trail", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    await updateProject({ actor: pm, projectId, data: { status: "IN_PRODUCTION" } });

    const entry = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: projectId, entityType: "PROJECT", fieldName: "status" },
      orderBy: { createdAt: "desc" },
    });

    assert.equal(entry.previousValue, "PLANNING");
    assert.equal(entry.newValue, "IN_PRODUCTION");
  });
});
