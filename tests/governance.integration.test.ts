import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import {
  completeAudit,
  recordFinding,
  saveAudit,
  saveCorrectiveAction,
  saveImprovement,
  verifyCorrectiveAction,
} from "@/lib/governance/audit-service";
import { activateSop, saveSop } from "@/lib/governance/sop-service";
import {
  loadCertificationState,
  saveTrainingRecord,
} from "@/lib/governance/training-service";
import { prisma } from "@/lib/prisma";

const TEST_PREFIX = "zz-gov-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let ownerId = "";
let secondOwnerId = "";
let pmId = "";
let specialistId = "";
let sopId = "";
let auditId = "";
let findingId = "";
let actionId = "";

async function cleanup() {
  const sops = await prisma.sop.findMany({
    where: { reference: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const sopIds = sops.map((sop) => sop.id);

  /*
   * Notifications about this fixture go to the real oversight accounts.
   *
   * An audit finding notifies whoever holds oversight, not the person who
   * raised it, so scoping the delete below to recipients whose email starts
   * with the prefix never touches them - it only ever matched notifications
   * sent to the fixture's own users. Eight rows per run were accumulating on
   * live accounts and showing up in the header badge.
   *
   * They carry the entity they are about, so the ids are collected here while
   * the records still exist and the notifications are removed by reference.
   */
  const [audits, findings, actions, requests] = await Promise.all([
    // The finding notifies about the audit it belongs to, not about itself -
    // entityId is audit.id - so the audits have to be in this list or the
    // rows survive.
    prisma.audit.findMany({
      where: { scope: { startsWith: TEST_PREFIX } },
      select: { id: true },
    }),
    prisma.auditFinding.findMany({
      where: { title: { startsWith: TEST_PREFIX } },
      select: { id: true },
    }),
    prisma.correctiveAction.findMany({
      where: { title: { startsWith: TEST_PREFIX } },
      select: { id: true },
    }),
    prisma.improvementRequest.findMany({
      where: { title: { startsWith: TEST_PREFIX } },
      select: { id: true },
    }),
  ]);
  const raisedAbout = [...audits, ...findings, ...actions, ...requests, ...sops].map(
    (row) => row.id,
  );

  if (raisedAbout.length) {
    await prisma.notification.deleteMany({ where: { entityId: { in: raisedAbout } } });
  }

  await prisma.sopVersion.deleteMany({ where: { sopId: { in: sopIds } } });
  await prisma.correctiveAction.deleteMany({
    where: { title: { startsWith: TEST_PREFIX } },
  });
  await prisma.auditFinding.deleteMany({ where: { title: { startsWith: TEST_PREFIX } } });
  await prisma.audit.deleteMany({ where: { scope: { startsWith: TEST_PREFIX } } });
  await prisma.sop.deleteMany({ where: { id: { in: sopIds } } });
  await prisma.improvementRequest.deleteMany({
    where: { title: { startsWith: TEST_PREFIX } },
  });
  await prisma.trainingRecord.deleteMany({
    where: { courseName: { startsWith: TEST_PREFIX } },
  });
  await prisma.notification.deleteMany({
    where: { recipient: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.activityLog.deleteMany({
    where: { actor: { email: { startsWith: TEST_PREFIX } } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

describe("governance (integration)", { skip: !hasDatabase }, () => {
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

    const [owner, second, pm, specialist] = await Promise.all([
      makeUser("Gov Owner", "owner", TeamRole.AGENCY_OWNER),
      makeUser("Gov Second Owner", "owner2", TeamRole.AGENCY_OWNER),
      makeUser("Gov PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("Gov Specialist", "specialist", TeamRole.CREATIVE_SPECIALIST),
    ]);

    ownerId = owner.id;
    secondOwnerId = second.id;
    pmId = pm.id;
    specialistId = specialist.id;
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // --- SOP library ---------------------------------------------------------

  it("refuses SOP management to a project manager", async () => {
    // The library is the owner's. A procedure everyone must follow, approved by
    // whoever wrote it, is an opinion with formatting.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveSop({
      actor: pm,
      reference: `${TEST_PREFIX}-01`,
      title: "Something",
      content: "Some content.",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("creates an SOP at version 1.0 as a draft", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await saveSop({
      actor: owner,
      reference: `${TEST_PREFIX}-01`,
      title: "Lead capture",
      content: "Capture the lead. Score it. Assign it.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    sopId = result.sop.id;
    assert.equal(result.version, "1.0");
    assert.equal(result.sop.status, "DRAFT");
  });

  it("refuses a second SOP with the same reference", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await saveSop({
      actor: owner,
      reference: `${TEST_PREFIX}-01`,
      title: "Lead capture again",
      content: "Different content.",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "DUPLICATE");
  });

  it("refuses to let the author of the version approve it", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await activateSop({ actor: owner, sopId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "SELF_APPROVAL");
  });

  it("activates when somebody else approves it", async () => {
    const second = await loadAuthContext(secondOwnerId);
    assert.ok(second);

    const result = await activateSop({ actor: second, sopId });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.sop.status, "ACTIVE");
    assert.equal(result.sop.approvedById, secondOwnerId);
    assert.ok(result.sop.nextReviewAt);
  });

  it("keeps the old version and drops back to draft when a new one is published", async () => {
    // The version somebody approved is not the version now in the box.
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await saveSop({
      actor: owner,
      sopId,
      reference: `${TEST_PREFIX}-01`,
      title: "Lead capture",
      content: "Capture the lead. Score it. Assign it. Follow up within one day.",
      changeNote: "Added the follow-up window.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.version, "1.1");
    assert.equal(result.sop.status, "DRAFT");
    assert.equal(result.sop.approvedById, null);

    const versions = await prisma.sopVersion.findMany({
      where: { sopId },
      orderBy: { publishedAt: "asc" },
      select: { version: true, content: true },
    });

    assert.equal(versions.length, 2);
    // The original text is untouched, which is the whole point of the library.
    assert.match(versions[0].content, /Capture the lead\. Score it\. Assign it\.$/);
  });

  it("refuses to publish a version identical to the current one", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await saveSop({
      actor: owner,
      sopId,
      reference: `${TEST_PREFIX}-01`,
      title: "Lead capture",
      content: "Capture the lead. Score it. Assign it. Follow up within one day.",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  // --- Audits --------------------------------------------------------------

  it("refuses auditing to a specialist", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await saveAudit({
      actor: specialist,
      type: "ROUTINE",
      scope: `${TEST_PREFIX} onboarding`,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("starts an audit with a generated reference", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveAudit({
      actor: pm,
      type: "ROUTINE",
      scope: `${TEST_PREFIX} onboarding for July accounts`,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    auditId = result.audit.id;
    assert.match(result.audit.reference, /^AUD-\d{4}$/);
    assert.equal(result.audit.status, "IN_PROGRESS");
  });

  it("records a critical finding and alerts leadership", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await recordFinding({
      actor: pm,
      auditId,
      title: `${TEST_PREFIX} access removed before client confirmed as admin`,
      detail: "Two accounts had agency access removed with no client administrator.",
      result: "CRITICAL_FAILURE",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    findingId = result.finding.id;
    // The flag follows the result even though it was not passed.
    assert.equal(result.finding.isCritical, true);

    const notified = await prisma.notification.findMany({
      where: { recipient: { email: { startsWith: TEST_PREFIX } }, urgency: "CRITICAL" },
      select: { title: true },
    });
    assert.ok(notified.some((item) => /Critical audit finding/i.test(item.title)));
  });

  it("refuses to close an audit over an unanswered critical finding", async () => {
    // An audit that closes over a critical failure is a record that the agency
    // noticed and moved on.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await completeAudit({ actor: pm, auditId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "UNRESOLVED_CRITICAL");
    assert.ok((result.outstanding ?? []).length > 0);
  });

  // --- Corrective actions --------------------------------------------------

  it("raises a corrective action against the finding", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveCorrectiveAction({
      actor: pm,
      findingId,
      title: `${TEST_PREFIX} enforce the access ordering rule`,
      immediateCorrection: "Restored administrator access on both accounts.",
      ownerId: pmId,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    actionId = result.action.id;
  });

  it("refuses to close a corrective action by setting its status", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveCorrectiveAction({
      actor: pm,
      actionId,
      title: `${TEST_PREFIX} enforce the access ordering rule`,
      status: "CLOSED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("closes the audit once the critical finding has an action against it", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await completeAudit({ actor: pm, auditId });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.audit.status, "COMPLETE");
  });

  it("refuses to reopen the record of a completed audit", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveAudit({
      actor: pm,
      auditId,
      type: "ROUTINE",
      scope: `${TEST_PREFIX} quietly reworded afterwards`,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("refuses to let the owner verify their own corrective action", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await verifyCorrectiveAction({ actor: pm, actionId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "SELF_VERIFICATION");
  });

  it("refuses to close one with no root cause recorded", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await verifyCorrectiveAction({ actor: owner, actionId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
    assert.match(result.message, /root cause/i);
  });

  it("verifies and closes once somebody else checks it and the cause is known", async () => {
    const pm = await loadAuthContext(pmId);
    const owner = await loadAuthContext(ownerId);
    assert.ok(pm && owner);

    await saveCorrectiveAction({
      actor: pm,
      actionId,
      title: `${TEST_PREFIX} enforce the access ordering rule`,
      rootCause: "The order was documented but nothing enforced it.",
      processCorrection: "The offboarding service now refuses the wrong order.",
      ownerId: pmId,
    });

    const result = await verifyCorrectiveAction({ actor: owner, actionId });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.action.status, "CLOSED");
    assert.equal(result.action.verifiedById, ownerId);
  });

  // --- Improvement backlog -------------------------------------------------

  it("lets a specialist propose an improvement", async () => {
    // SOP 10: everybody takes part. A backlog only leadership can write to
    // collects only leadership's ideas.
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await saveImprovement({
      actor: specialist,
      title: `${TEST_PREFIX} pre-fill the QA checklist`,
      problem: "Every QA pass starts by typing the same eight checks.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.improvement.raisedById, specialistId);
  });

  it("does not let a specialist accept their own proposal", async () => {
    // Raising one is everybody's job. Deciding what the agency works on is not.
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const existing = await prisma.improvementRequest.findFirstOrThrow({
      where: { title: { startsWith: TEST_PREFIX } },
      select: { id: true, title: true, problem: true },
    });

    const result = await saveImprovement({
      actor: specialist,
      improvementId: existing.id,
      title: existing.title,
      problem: existing.problem,
      status: "ACCEPTED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("refuses to mark an improvement implemented with no result", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const existing = await prisma.improvementRequest.findFirstOrThrow({
      where: { title: { startsWith: TEST_PREFIX } },
      select: { id: true, title: true, problem: true },
    });

    const result = await saveImprovement({
      actor: pm,
      improvementId: existing.id,
      title: existing.title,
      problem: existing.problem,
      status: "IMPLEMENTED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  // --- Training and certification ------------------------------------------

  it("refuses to let somebody certify themselves", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveTrainingRecord({
      actor: pm,
      userId: pmId,
      courseName: `${TEST_PREFIX} launch procedure`,
      certificationAwarded: "CERTIFIED_OPERATOR",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "SELF_CERTIFICATION");
  });

  it("treats somebody with no records as uncertified rather than lapsed", async () => {
    assert.equal(await loadCertificationState(specialistId), "none");
  });

  it("records a certification and reports it current", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await saveTrainingRecord({
      actor: owner,
      userId: pmId,
      courseName: `${TEST_PREFIX} launch procedure`,
      sopReference: "SOP-07",
      status: "COMPLETED",
      certificationAwarded: "CERTIFIED_OPERATOR",
      certificationExpiresAt: new Date(Date.now() + 200 * 86_400_000),
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.record.trainerId, ownerId);

    assert.equal(await loadCertificationState(pmId), "current");
  });

  it("reports expired once the certification lapses", async () => {
    await prisma.trainingRecord.updateMany({
      where: { userId: pmId, courseName: { startsWith: TEST_PREFIX } },
      data: { certificationExpiresAt: new Date(Date.now() - 86_400_000) },
    });

    assert.equal(await loadCertificationState(pmId), "expired");
  });
});
