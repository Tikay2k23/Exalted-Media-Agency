import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { deriveProjectProgress } from "@/lib/delivery/project-service";

/**
 * Project progress, against a project of our own.
 *
 * This was the second blocked UAT case, and the blocker was the test data
 * rather than the code: the probe task was not on a project, and attaching one
 * to a real client's project would have moved that project's real numbers.
 * The answer is a dedicated client and project, not a change to the
 * production calculation - which is exercised here exactly as it ships.
 */

const TEST_PREFIX = "zz-progress-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let projectId = "";
const milestoneIds: string[] = [];

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.milestone.deleteMany({ where: { project: { clientId: { in: ids } } } });
  await prisma.employeeTask.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.project.deleteMany({ where: { clientId: { in: ids } } });
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

/** The milestones as the page reads them, straight from the database. */
async function milestones() {
  const rows = await prisma.milestone.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
    select: { id: true, position: true, completedAt: true, dueDate: true, name: true },
  });

  /* Dates, exactly as the service takes them - no reshaping for the test. */
  return rows;
}

describe("project progress (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const owner = await prisma.user.create({
      data: {
        name: "Progress Test Owner",
        email: `${TEST_PREFIX}-owner@example.test`,
        passwordHash: "not-a-real-hash",
        role: Role.ADMIN,
        teamRole: TeamRole.PROJECT_MANAGER,
      },
      select: { id: true },
    });

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "in_production", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Progress Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "WEBSITE_SUPPORT",
        currentStageId: stage.id,
        assignedUserId: owner.id,
      },
      select: { id: true },
    });

    const project = await prisma.project.create({
      data: {
        clientId: client.id,
        name: `${TEST_PREFIX} build`,
        serviceType: "WEBSITE_SUPPORT",
        projectManagerId: owner.id,
      },
      select: { id: true },
    });

    projectId = project.id;

    /* Four milestones, one of them already overdue. */
    for (const [index, name] of ["Discovery", "Design", "Build", "Launch"].entries()) {
      const created = await prisma.milestone.create({
        data: {
          projectId: project.id,
          name: `${TEST_PREFIX} ${name}`,
          position: index,
          dueDate: new Date(Date.now() + (index === 0 ? -3 : index) * 86_400_000),
        },
        select: { id: true },
      });

      milestoneIds.push(created.id);
    }
  });

  after(cleanup);

  it("starts at nothing done", async () => {
    const progress = deriveProjectProgress(await milestones());

    assert.equal(progress.percentComplete, 0);
    assert.equal(progress.completedCount, 0);
    assert.equal(progress.totalCount, 4);
  });

  it("counts an overdue milestone as overdue rather than complete", async () => {
    const progress = deriveProjectProgress(await milestones());

    assert.equal(progress.overdueCount, 1, "the one dated in the past");
    assert.equal(progress.percentComplete, 0, "overdue is not progress");
  });

  it("moves as work is finished", async () => {
    await prisma.milestone.update({
      where: { id: milestoneIds[0] },
      data: { completedAt: new Date() },
    });

    let progress = deriveProjectProgress(await milestones());

    assert.equal(progress.completedCount, 1);
    assert.equal(progress.percentComplete, 25);
    assert.equal(progress.overdueCount, 0, "completing it clears the overdue count");

    await prisma.milestone.update({
      where: { id: milestoneIds[1] },
      data: { completedAt: new Date() },
    });

    progress = deriveProjectProgress(await milestones());

    assert.equal(progress.completedCount, 2);
    assert.equal(progress.percentComplete, 50);
  });

  it("names the milestone in front and the one after it", async () => {
    const progress = deriveProjectProgress(await milestones());

    /* These are the names themselves, not milestone objects. */
    assert.ok(progress.currentMilestone, "there is a current one");
    assert.match(progress.currentMilestone ?? "", /Build/);
    assert.match(progress.nextMilestone ?? "", /Launch/);
  });

  it("reaches 100 only when everything is done", async () => {
    await prisma.milestone.updateMany({
      where: { projectId, completedAt: null },
      data: { completedAt: new Date() },
    });

    const progress = deriveProjectProgress(await milestones());

    assert.equal(progress.percentComplete, 100);
    assert.equal(progress.completedCount, 4);
    assert.equal(progress.currentMilestone, null, "nothing left in front");
  });

  it("is derived, never stored", async () => {
    /*
     * The reason this can be trusted: there is no percentage column to drift.
     * Deleting a milestone changes the answer immediately, with nothing to
     * recalculate.
     */
    await prisma.milestone.delete({ where: { id: milestoneIds[3] } });

    const progress = deriveProjectProgress(await milestones());

    assert.equal(progress.totalCount, 3);
    assert.equal(progress.percentComplete, 100, "three of three");
  });
});
