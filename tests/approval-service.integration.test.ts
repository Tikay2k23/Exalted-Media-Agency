import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { recordApproval, withdrawApproval } from "@/lib/approvals/approval-service";
import { loadAuthContext } from "@/lib/authz";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { prisma } from "@/lib/prisma";

const TEST_PREFIX = "zz-approval-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let specialistId = "";
let ownerId = "";
let approverContactId = "";
let plainContactId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.approval.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.clientContact.deleteMany({ where: { clientId: { in: ids } } });
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

/** Whether the launch gate is still blocked on a client approval. */
async function approvalBlocks() {
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
    (item) => item.key === "client_approval_recorded",
  );
}

describe("client approvals (integration)", { skip: !hasDatabase }, () => {
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

    const [pm, specialist, owner] = await Promise.all([
      makeUser("Approval Test PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("Approval Test Specialist", "specialist", TeamRole.CREATIVE_SPECIALIST),
      makeUser("Approval Test Owner", "owner", TeamRole.AGENCY_OWNER),
    ]);

    pmId = pm.id;
    specialistId = specialist.id;
    ownerId = owner.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "client_review", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Approval Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "FULL_SERVICE_RETAINER",
        currentStageId: stage.id,
        assignedUserId: pm.id,
        contacts: {
          create: [
            { name: "Maria Santos", isPrimary: true, isApprover: true, role: "Owner" },
            { name: "Ben Ortega", isApprover: false, role: "Marketing assistant" },
          ],
        },
      },
      select: { id: true, contacts: { select: { id: true, isApprover: true } } },
    });

    clientId = client.id;
    approverContactId = client.contacts.find((contact) => contact.isApprover)!.id;
    plainContactId = client.contacts.find((contact) => !contact.isApprover)!.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const base = {
    type: "DELIVERABLE" as const,
    subject: "Homepage and booking funnel, round 2",
  };

  it("refuses to record an approval for a specialist", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await recordApproval({
      actor: specialist,
      clientId,
      ...base,
      approverContactId,
      evidenceUrl: "https://mail.example.test/thread/9",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("blocks the launch gate while nothing is recorded", async () => {
    assert.equal(await approvalBlocks(), true);
  });

  it("refuses an approval attributed to a contact who is not an authorized approver", async () => {
    // Otherwise the authorized-approver requirement is decorative: anybody
    // could sign off using whichever contact happened to reply to an email.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordApproval({
      actor: pm,
      clientId,
      ...base,
      approverContactId: plainContactId,
      evidenceUrl: "https://mail.example.test/thread/9",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NO_APPROVER");
    assert.match(result.message, /Ben Ortega/);
  });

  it("refuses an approver who belongs to a different account", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const other = await prisma.clientContact.findFirst({
      where: { clientId: { not: clientId } },
      select: { id: true },
    });

    if (!other) return;

    const result = await recordApproval({
      actor: pm,
      clientId,
      ...base,
      approverContactId: other.id,
      evidenceUrl: "https://mail.example.test/thread/9",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NOT_FOUND");
  });

  it("refuses an approval with no evidence", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordApproval({
      actor: pm,
      clientId,
      ...base,
      approverContactId,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
    assert.match(result.message, /evidence/i);
  });

  it("refuses an approval dated in the future", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordApproval({
      actor: pm,
      clientId,
      ...base,
      approverContactId,
      evidenceUrl: "https://mail.example.test/thread/9",
      approvedAt: new Date(Date.now() + 86_400_000),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
    assert.match(result.message, /future/i);
  });

  it("records an approval and snapshots who gave it", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordApproval({
      actor: pm,
      clientId,
      ...base,
      approverContactId,
      notes: "Approved on a call with Maria on 6 Aug; summary emailed the same day.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    // The name is copied, not only referenced: the contact relation is
    // SetNull on delete, and a sign-off that forgets who gave it is no record.
    assert.equal(result.approval.approvedByName, "Maria Santos");
    assert.equal(result.approval.recordedById, pmId);
    assert.equal(result.approval.status, "RECORDED");
  });

  it("still names the approver after the contact is removed", async () => {
    const removable = await prisma.clientContact.create({
      data: { clientId, name: "Departing Approver", isApprover: true },
      select: { id: true },
    });

    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const recorded = await recordApproval({
      actor: pm,
      clientId,
      type: "SCOPE_CHANGE",
      subject: "Extra landing page",
      approverContactId: removable.id,
      evidenceUrl: "https://mail.example.test/thread/12",
    });

    assert.equal(recorded.ok, true);
    if (!recorded.ok) return;

    await prisma.clientContact.delete({ where: { id: removable.id } });

    const after = await prisma.approval.findUniqueOrThrow({
      where: { id: recorded.approval.id },
      select: { approverContactId: true, approvedByName: true },
    });

    assert.equal(after.approverContactId, null);
    assert.equal(after.approvedByName, "Departing Approver");
  });

  it("opens the launch gate once a deliverable approval is on file", async () => {
    assert.equal(await approvalBlocks(), false);
  });

  it("refuses to withdraw without a reason worth reading", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const approval = await prisma.approval.findFirstOrThrow({
      where: { clientId, type: "DELIVERABLE" },
      select: { id: true },
    });

    const result = await withdrawApproval({
      actor: pm,
      approvalId: approval.id,
      reason: "nope",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("withdraws an approval, keeps the record, and closes the gate again", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const approval = await prisma.approval.findFirstOrThrow({
      where: { clientId, type: "DELIVERABLE" },
      select: { id: true, subject: true },
    });

    const result = await withdrawApproval({
      actor: owner,
      approvalId: approval.id,
      reason: "Maria retracted it on the 7 Aug call - she wants the pricing section changed.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.approval.status, "WITHDRAWN");
    assert.equal(result.approval.withdrawnById, ownerId);
    assert.ok(result.approval.withdrawnAt);

    // Nothing is deleted: the subject, the approver, and the original date
    // are all still there.
    assert.equal(result.approval.subject, approval.subject);
    assert.equal(result.approval.approvedByName, "Maria Santos");

    assert.equal(await approvalBlocks(), true);

    // Whoever recorded it needs to know it is gone.
    const notified = await prisma.notification.findMany({
      where: { entityId: clientId, recipientId: pmId },
      select: { title: true },
    });
    assert.ok(notified.some((item) => /withdrawn/i.test(item.title)));
  });

  it("refuses to withdraw the same approval twice", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const approval = await prisma.approval.findFirstOrThrow({
      where: { clientId, status: "WITHDRAWN" },
      select: { id: true },
    });

    const result = await withdrawApproval({
      actor: owner,
      approvalId: approval.id,
      reason: "Trying to withdraw it a second time for no good reason.",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "ALREADY_WITHDRAWN");
  });

  it("does not let a scope change approval stand in for a deliverable sign-off", async () => {
    // The scope change recorded earlier is still RECORDED and perfectly valid,
    // but it is not the client approving the work itself.
    const live = await prisma.approval.findMany({
      where: { clientId, status: "RECORDED" },
      select: { type: true },
    });

    assert.ok(live.some((approval) => approval.type === "SCOPE_CHANGE"));
    assert.equal(await approvalBlocks(), true);
  });

  it("reopens the gate when a fresh approval is recorded", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordApproval({
      actor: pm,
      clientId,
      type: "FINAL_SIGN_OFF",
      subject: "Homepage and booking funnel, round 3",
      approverContactId,
      evidenceUrl: "https://mail.example.test/thread/21",
    });

    assert.equal(result.ok, true);
    assert.equal(await approvalBlocks(), false);
  });

  it("does not let a hand-written approval with no evidence satisfy the gate", async () => {
    // Belt and braces: the gate re-derives usability rather than trusting that
    // a row exists, in case an approval ever reaches the database another way.
    await prisma.approval.updateMany({
      where: { clientId, status: "RECORDED" },
      data: { evidenceUrl: null, notes: null },
    });

    assert.equal(await approvalBlocks(), true);
  });
});
