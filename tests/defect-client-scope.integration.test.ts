import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { DefectSeverity, DefectStatus, Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { addQaTest, closeDefect, updateDefect } from "@/lib/quality/defect-service";

/**
 * A defect id is not an entitlement to the account it belongs to.
 *
 * createDefect always resolved the client through the scoped loader. The three
 * mutations that follow it did not: they fetched by id, checked that the
 * person held qa.test, and wrote. A specialist assigned to one account could
 * therefore escalate a defect on an account they cannot see - and severity
 * feeds the approval gate and the account's health.
 *
 * Proven by probe before it was fixed: a creative specialist raised a LOW
 * defect on another client to CRITICAL and the call returned ok.
 *
 * These run against the development database and skip without one.
 */

const TEST_PREFIX = "zz-defect-scope";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let outsiderId = "";
let defectId = "";
let planId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.qaTest.deleteMany({ where: { plan: { clientId: { in: ids } } } });
  await prisma.qaPlan.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.defect.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { actor: { email: { startsWith: TEST_PREFIX } } },
        ...(ids.length ? [{ entityId: { in: ids } }] : []),
      ],
    },
  });
  await prisma.notification.deleteMany({
    where: { recipient: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

describe("defect client scope (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    /*
     * Somebody who may work on defects but is not on this account: the seat
     * the hole was reachable from.
     */
    const outsider = await prisma.user.create({
      data: {
        name: "Defect Scope Outsider",
        email: `${TEST_PREFIX}-outsider@example.test`,
        passwordHash: "not-a-real-hash",
        role: Role.TEAM_MEMBER,
        teamRole: TeamRole.CREATIVE_SPECIALIST,
      },
      select: { id: true },
    });

    const owner = await prisma.user.create({
      data: {
        name: "Defect Scope Owner",
        email: `${TEST_PREFIX}-owner@example.test`,
        passwordHash: "not-a-real-hash",
        role: Role.ADMIN,
        teamRole: TeamRole.PROJECT_MANAGER,
      },
      select: { id: true },
    });

    outsiderId = outsider.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "internal_quality_assurance", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Defect Scope Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "SEO",
        currentStageId: stage.id,
        /* Assigned to somebody else, and the outsider has no task on it. */
        assignedUserId: owner.id,
      },
      select: { id: true },
    });

    const defect = await prisma.defect.create({
      data: {
        clientId: client.id,
        reference: `${TEST_PREFIX}-1`,
        title: "Probe defect",
        description: "Raised for the scope test.",
        severity: DefectSeverity.LOW,
        status: DefectStatus.NEW,
      },
      select: { id: true },
    });

    defectId = defect.id;

    const plan = await prisma.qaPlan.create({
      data: {
        clientId: client.id,
        name: `${TEST_PREFIX} plan`,
        deliverable: "Probe deliverable",
      },
      select: { id: true },
    });

    planId = plan.id;
  });

  after(cleanup);

  it("gives the outsider the permission but not the account", async () => {
    const actor = await loadAuthContext(outsiderId);
    assert.ok(actor);

    /* The combination that made this reachable: may test, cannot see all. */
    assert.equal(can(actor, "qa.test"), true);
    assert.equal(can(actor, "clients.view.all"), false);
  });

  it("refuses to change a defect on a client it cannot see", async () => {
    const actor = await loadAuthContext(outsiderId);
    assert.ok(actor);

    const result = await updateDefect({
      actor,
      defectId,
      data: { severity: DefectSeverity.CRITICAL },
    });

    assert.equal(result.ok, false);

    if (!result.ok) {
      /* Not FORBIDDEN: that would confirm the record exists. */
      assert.equal(result.code, "NOT_FOUND");
    }

    const after = await prisma.defect.findUniqueOrThrow({
      where: { id: defectId },
      select: { severity: true },
    });

    assert.equal(after.severity, DefectSeverity.LOW, "severity must be untouched");
  });

  it("refuses to close a defect on a client it cannot see", async () => {
    const actor = await loadAuthContext(outsiderId);
    assert.ok(actor);

    const result = await closeDefect({
      actor,
      defectId,
      resolution: DefectStatus.CLOSED,
      retestResult: "probe",
    });

    assert.equal(result.ok, false);

    const after = await prisma.defect.findUniqueOrThrow({
      where: { id: defectId },
      select: { status: true },
    });

    assert.equal(after.status, DefectStatus.NEW, "status must be untouched");
  });

  it("refuses to add a QA test to a plan on a client it cannot see", async () => {
    const actor = await loadAuthContext(outsiderId);
    assert.ok(actor);

    const result = await addQaTest({
      actor,
      planId,
      data: {
        objective: "probe",
        steps: "probe",
        expectedResult: "probe",
      },
    });

    assert.equal(result.ok, false);

    const count = await prisma.qaTest.count({ where: { planId } });

    assert.equal(count, 0, "no test may be written into another client's plan");
  });
});
