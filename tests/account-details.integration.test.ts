import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { getRequirementRemedy } from "@/lib/journey/requirement-remedies";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { prisma } from "@/lib/prisma";

/**
 * The loop that was missing: a stage gate names something, and the account page
 * can actually resolve it.
 *
 * These assertions exercise the same evaluation the interface runs, before and
 * after the fields the account form writes.
 */

const TEST_PREFIX = "zz-account-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { actor: { email: { startsWith: TEST_PREFIX } } },
        ...(ids.length ? [{ entityId: { in: ids } }] : []),
      ],
    },
  });
  await prisma.clientContact.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientStageHistory.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.client.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function requirementsFor(stageKey: string) {
  const stage = await prisma.pipelineStage.findFirstOrThrow({
    where: { stageKey, isDeprecated: false },
    select: {
      requirements: {
        select: { requirementKey: true, label: true, isBlocking: true },
        orderBy: { position: "asc" },
      },
    },
  });

  return stage.requirements;
}

async function blockingKeys(stageKey: string) {
  const client = await loadClientForEvaluation(clientId);
  assert.ok(client);

  const gate = evaluateStageRequirements(client, await requirementsFor(stageKey));
  return gate.blocking.map((item) => item.key).sort();
}

describe("account details close the stage gate loop (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const pm = await prisma.user.create({
      data: {
        name: "Account Test PM",
        email: `${TEST_PREFIX}-pm@example.test`,
        passwordHash: "not-a-real-hash",
        role: Role.MANAGER,
        teamRole: TeamRole.PROJECT_MANAGER,
      },
      select: { id: true },
    });
    pmId = pm.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "payment_received", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Account Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "SEO",
        currentStageId: stage.id,
      },
      select: { id: true },
    });
    clientId = client.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("starts blocked on the fields the account form owns", async () => {
    const blocked = await blockingKeys("in_production");

    assert.ok(blocked.includes("account_owner_assigned"));
    assert.ok(blocked.includes("contract_recorded"));
  });

  it("clears the owner requirement once an owner is set", async () => {
    await prisma.client.update({
      where: { id: clientId },
      data: { assignedUserId: pmId },
    });

    const blocked = await blockingKeys("in_production");
    assert.ok(!blocked.includes("account_owner_assigned"));
  });

  it("still blocks on the contract when only one of the two fields is filled", async () => {
    // Half a contract is not a contract: the gate wants both the start date and
    // the value, which is why the form asks for both together.
    await prisma.client.update({
      where: { id: clientId },
      data: { contractStartDate: new Date("2026-01-01"), monthlyValue: null },
    });

    assert.ok((await blockingKeys("in_production")).includes("contract_recorded"));

    await prisma.client.update({
      where: { id: clientId },
      data: { contractStartDate: null, monthlyValue: 2500 },
    });

    assert.ok((await blockingKeys("in_production")).includes("contract_recorded"));
  });

  it("clears the contract requirement once both fields are recorded", async () => {
    await prisma.client.update({
      where: { id: clientId },
      data: { contractStartDate: new Date("2026-01-01"), monthlyValue: 2500 },
    });

    const blocked = await blockingKeys("in_production");
    assert.ok(!blocked.includes("contract_recorded"));
  });

  it("treats a zero monthly value as a real answer, not a blank", async () => {
    // A pro bono or trial account has a deliberate value of zero.
    await prisma.client.update({ where: { id: clientId }, data: { monthlyValue: 0 } });

    assert.ok(!(await blockingKeys("in_production")).includes("contract_recorded"));

    await prisma.client.update({ where: { id: clientId }, data: { monthlyValue: 2500 } });
  });

  it("clears the approver requirement once a contact is marked as one", async () => {
    assert.ok((await blockingKeys("client_review")).includes("client_approver_recorded"));

    await prisma.clientContact.create({
      data: {
        clientId,
        name: "Account Test Approver",
        isPrimary: true,
        isApprover: true,
      },
    });

    const blocked = await blockingKeys("client_review");
    assert.ok(!blocked.includes("client_approver_recorded"));
  });

  it("clears the health requirement once a health status is set", async () => {
    assert.ok((await blockingKeys("ongoing_management")).includes("health_assessed"));

    await prisma.client.update({
      where: { id: clientId },
      data: { healthStatus: "GREEN" },
    });

    assert.ok(!(await blockingKeys("ongoing_management")).includes("health_assessed"));
  });

  it("clears the renewal requirement once a renewal date is set", async () => {
    assert.ok((await blockingKeys("renewal_discussion")).includes("renewal_date_set"));

    await prisma.client.update({
      where: { id: clientId },
      data: { renewalDate: new Date("2027-01-01") },
    });

    assert.ok(!(await blockingKeys("renewal_discussion")).includes("renewal_date_set"));
  });

  it("clears everything this page owns, and leaves only work resolvable elsewhere", async () => {
    // Asserted as a property rather than a fixed list, because the list gets
    // shorter every time another module ships. What must stay true is that the
    // account page resolves what it owns, and that whatever still blocks has a
    // home somewhere in the app.
    const ownedByThisPage = [
      "account_owner_assigned",
      "contract_recorded",
      "health_assessed",
      "renewal_date_set",
      "primary_contact_recorded",
      "client_approver_recorded",
    ];

    const blocked = await blockingKeys("in_production");

    for (const key of ownedByThisPage) {
      assert.ok(
        !blocked.includes(key),
        `"${key}" is set on this page but still blocks`,
      );
    }

    for (const key of blocked) {
      assert.equal(
        getRequirementRemedy(key).notBuiltYet ?? false,
        false,
        `"${key}" blocks but has nowhere to be resolved`,
      );
    }

    // Work assignment lives on the Team page, so it is expected to remain.
    assert.ok(blocked.includes("work_assigned"));
  });

});
