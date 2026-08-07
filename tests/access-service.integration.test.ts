import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { prisma } from "@/lib/prisma";
import { createAccessRecord, updateAccessRecord } from "@/lib/security/access-service";

const TEST_PREFIX = "zz-access-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let specialistId = "";
let ghlRecordId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.accessRecord.deleteMany({ where: { clientId: { in: ids } } });
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

async function blockedKeys(stageKey: string) {
  const stage = await prisma.pipelineStage.findFirstOrThrow({
    where: { stageKey, isDeprecated: false },
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

describe("platform access (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const [pm, specialist] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Access Test PM",
          email: `${TEST_PREFIX}-pm@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.PROJECT_MANAGER,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Access Test Specialist",
          email: `${TEST_PREFIX}-specialist@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.AUTOMATION_SPECIALIST,
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
        clientName: "Access Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "CRM_AUTOMATION",
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

  it("refuses access management to a specialist", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await createAccessRecord({
      actor: specialist,
      clientId,
      data: { platform: "GOHIGHLEVEL", status: "REQUESTED", isCritical: true },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("rejects a password pasted into the notes", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await createAccessRecord({
      actor: pm,
      clientId,
      data: {
        platform: "HOSTING",
        status: "GRANTED",
        isCritical: false,
        notes: "login admin, password: hunter2trustno1",
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "CREDENTIAL_REJECTED");
    assert.equal(result.field, "notes");

    // Nothing was written.
    const stored = await prisma.accessRecord.count({
      where: { clientId, platform: "HOSTING" },
    });
    assert.equal(stored, 0);
  });

  it("rejects an API key in the credential location field", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await createAccessRecord({
      actor: pm,
      clientId,
      data: {
        platform: "STRIPE",
        status: "GRANTED",
        isCritical: false,
        credentialLocation: "sk_live_51H8xKlMnOpQrStUvWx",
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "CREDENTIAL_REJECTED");
  });

  it("accepts a record that says where the credential lives", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await createAccessRecord({
      actor: pm,
      clientId,
      data: {
        platform: "GOHIGHLEVEL",
        status: "REQUESTED",
        isCritical: true,
        accountName: "Acme Ltd sub-account",
        permissionLevel: "Admin",
        credentialLocation: "Client 1Password vault",
      },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    ghlRecordId = result.record.id;
    assert.equal(result.record.requestedAt !== null, true);
    assert.equal(result.record.grantedAt, null);
  });

  it("blocks production while critical access is only requested", async () => {
    assert.ok((await blockedKeys("in_production")).includes("critical_access_collected"));
  });

  it("clears the collection gate once access is granted", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await updateAccessRecord({
      actor: pm,
      recordId: ghlRecordId,
      data: { status: "GRANTED" },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.record.grantedAt);

    assert.ok(!(await blockedKeys("in_production")).includes("critical_access_collected"));
  });

  it("keeps granted-but-untested distinct from tested", async () => {
    // Onboarding completion asks for tested access, which is a stronger claim
    // than an invite having been accepted.
    assert.ok((await blockedKeys("onboarding_complete")).includes("critical_access_tested"));

    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await updateAccessRecord({
      actor: pm,
      recordId: ghlRecordId,
      data: { status: "TESTED" },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.record.testedAt);

    assert.ok(!(await blockedKeys("onboarding_complete")).includes("critical_access_tested"));
  });

  it("refuses a duplicate record for the same platform", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await createAccessRecord({
      actor: pm,
      clientId,
      data: { platform: "GOHIGHLEVEL", status: "REQUESTED", isCritical: true },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("clears the granted timestamp when access is revoked", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await updateAccessRecord({
      actor: pm,
      recordId: ghlRecordId,
      data: { status: "REVOKED" },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.record.grantedAt, null);
    assert.equal(result.record.testedAt, null);
    assert.ok(result.record.removedAt);

    // Revoking critical access blocks production again.
    assert.ok((await blockedKeys("in_production")).includes("critical_access_collected"));
  });

  it("records the status change on the audit trail", async () => {
    const entry = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: clientId, fieldName: "accessStatus" },
      orderBy: { createdAt: "desc" },
    });

    assert.equal(entry.newValue, "REVOKED");
  });

  it("never stores a field that could hold a secret", async () => {
    // Structural guarantee, not a behavioural one: if somebody adds a password
    // column later, this fails.
    const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `select column_name from information_schema.columns
       where table_name = 'AccessRecord' and table_schema = 'public'`,
    );

    const names = columns.map((column) => column.column_name.toLowerCase());
    const forbidden = ["password", "secret", "token", "apikey", "api_key", "privatekey"];

    for (const name of names) {
      for (const banned of forbidden) {
        assert.ok(
          !name.includes(banned),
          `AccessRecord has a "${name}" column, which must never exist`,
        );
      }
    }
  });
});
