import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/workflow/client-intake-service";

const TEST_PREFIX = "zz-create-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let ownerId = "";
let busyPmId = "";
let automationId = "";
let specialistId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.clientWorkstream.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientHandoff.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.strategyBrief.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientContact.deleteMany({ where: { clientId: { in: ids } } });
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

describe("guided client creation (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const makeUser = (name: string, suffix: string, teamRole: TeamRole) =>
      prisma.user.create({
        data: {
          name,
          email: `${TEST_PREFIX}-${suffix}@example.test`,
          passwordHash: "not-a-real-hash",
          role: teamRole === TeamRole.AGENCY_OWNER ? Role.OWNER : Role.TEAM_MEMBER,
          teamRole,
        },
        select: { id: true },
      });

    const [owner, busy, , automation, specialist] = await Promise.all([
      makeUser("Create Owner", "owner", TeamRole.AGENCY_OWNER),
      makeUser("Create Busy PM", "busypm", TeamRole.PROJECT_MANAGER),
      makeUser("Create Free PM", "freepm", TeamRole.PROJECT_MANAGER),
      makeUser("Create Automation", "automation", TeamRole.AUTOMATION_SPECIALIST),
      makeUser("Create Specialist", "specialist", TeamRole.CREATIVE_SPECIALIST),
    ]);

    ownerId = owner.id;
    busyPmId = busy.id;
    automationId = automation.id;
    specialistId = specialist.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const basics = {
    contactName: "Dana Reyes",
    contactEmail: `${TEST_PREFIX}-dana@example.test`,
  };

  it("refuses client creation to a specialist", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await createClient({
      actor: specialist,
      companyName: `${TEST_PREFIX} Nope`,
      serviceType: "CRM_AUTOMATION",
      ...basics,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("refuses a client with no name or contact", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await createClient({
      actor: owner,
      companyName: "   ",
      contactName: "",
      contactEmail: "",
      serviceType: "CRM_AUTOMATION",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("creates the client on the journey, owned, with onboarding work", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await createClient({
      actor: owner,
      companyName: `${TEST_PREFIX} Reyes Plumbing`,
      serviceType: "CRM_AUTOMATION",
      projectManagerId: busyPmId,
      specialistOwners: { AUTOMATION_SPECIALIST: automationId },
      mainGoal: "Thirty booked jobs a month.",
      targetAudience: "Homeowners within 30 miles.",
      ...basics,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: result.client.id },
      select: {
        assignedUserId: true,
        currentOwnerRole: true,
        currentOwnerId: true,
        nextAction: true,
        currentStage: { select: { stageKey: true } },
      },
    });

    assert.equal(client.currentStage.stageKey, "payment_received");
    assert.equal(client.assignedUserId, busyPmId);
    assert.equal(client.currentOwnerRole, "PROJECT_MANAGER");
    assert.equal(client.currentOwnerId, busyPmId);
    assert.ok(client.nextAction);

    // The point of the whole exercise: somebody has something to do.
    assert.ok(result.generatedTaskCount > 0);
  });

  it("creates only the workstreams that service needs", async () => {
    const client = await prisma.client.findFirstOrThrow({
      where: { companyName: { startsWith: `${TEST_PREFIX} Reyes` } },
      select: { workstreams: { select: { role: true, ownerId: true } } },
    });

    const roles = client.workstreams.map((stream) => stream.role).sort();

    assert.deepEqual(roles, ["AUTOMATION_SPECIALIST", "PROJECT_MANAGER", "SALES_REP"]);

    const automation = client.workstreams.find(
      (stream) => stream.role === "AUTOMATION_SPECIALIST",
    );
    assert.equal(automation?.ownerId, automationId);
  });

  it("records the primary contact as a real contact record", async () => {
    // Several gates and the approval register read contacts, not the three
    // fields on the client.
    const contact = await prisma.clientContact.findFirstOrThrow({
      where: { client: { companyName: { startsWith: `${TEST_PREFIX} Reyes` } } },
      select: { name: true, isPrimary: true, isDecisionMaker: true },
    });

    assert.equal(contact.name, "Dana Reyes");
    assert.equal(contact.isPrimary, true);
  });

  it("starts the strategy brief from the answers given in the wizard", async () => {
    const brief = await prisma.strategyBrief.findFirstOrThrow({
      where: { client: { companyName: { startsWith: `${TEST_PREFIX} Reyes` } } },
      select: { status: true, primaryGoal: true, targetAudience: true },
    });

    assert.equal(brief.status, "DRAFT");
    assert.match(brief.primaryGoal ?? "", /Thirty booked jobs/);
    assert.match(brief.targetAudience ?? "", /Homeowners/);
  });

  it("tells the project manager the client has arrived", async () => {
    const notified = await prisma.notification.findMany({
      where: { recipientId: busyPmId },
      select: { title: true },
    });

    assert.ok(notified.some((item) => /New client/i.test(item.title)));
  });

  it("refuses a second account for the same business", async () => {
    // Creating the same company twice is exactly the confusion this replaces.
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await createClient({
      actor: owner,
      companyName: `${TEST_PREFIX} reyes plumbing`,
      serviceType: "CRM_AUTOMATION",
      ...basics,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "DUPLICATE");
  });

  it("falls back to the least-loaded project manager when none is chosen", async () => {
    // A client created unowned is one nobody is looking at on day one.
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await createClient({
      actor: owner,
      companyName: `${TEST_PREFIX} Auto Assigned`,
      serviceType: "WEBSITE_SUPPORT",
      contactName: "Sam Okafor",
      contactEmail: `${TEST_PREFIX}-sam@example.test`,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: result.client.id },
      select: { assignedUserId: true, assignedUser: { select: { teamRole: true } } },
    });

    assert.ok(client.assignedUserId, "a client must never be created unowned");
    assert.equal(client.assignedUser?.teamRole, "PROJECT_MANAGER");

    // Asserted as the property rather than a fixture id: the pool is every
    // project manager in the agency, not only the two this test made, so
    // naming one would break the moment somebody is hired.
    const loads = await prisma.user.findMany({
      where: { teamRole: "PROJECT_MANAGER", isActive: true, deletedAt: null },
      select: {
        id: true,
        _count: { select: { assignedClients: { where: { deletedAt: null } } } },
      },
    });

    const chosen = loads.find((pm) => pm.id === client.assignedUserId);
    const lightest = Math.min(...loads.map((pm) => pm._count.assignedClients));

    assert.ok(chosen);
    // The chosen one carries this client now, so at most one above the floor.
    assert.ok(
      chosen._count.assignedClients <= lightest + 1,
      "the busiest project manager should not have been chosen",
    );
  });

  it("gives a website client the creative seat and not the automation one", async () => {
    const client = await prisma.client.findFirstOrThrow({
      where: { companyName: { startsWith: `${TEST_PREFIX} Auto Assigned` } },
      select: { workstreams: { select: { role: true } } },
    });

    const roles = client.workstreams.map((stream) => stream.role).sort();

    assert.deepEqual(roles, ["CREATIVE_SPECIALIST", "PROJECT_MANAGER", "SALES_REP"]);
  });
});
