import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import {
  convertReferralToLead,
  saveReferral,
  saveTestimonial,
} from "@/lib/growth/advocacy-service";
import { saveExpansion, saveRenewal } from "@/lib/growth/renewal-service";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { prisma } from "@/lib/prisma";
import { saveOffboarding } from "@/lib/success/offboarding-service";

const TEST_PREFIX = "zz-phase9-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let pmId = "";
let specialistId = "";
let salesId = "";
let referralId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.referral.deleteMany({ where: { referringClientId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { contactName: { startsWith: TEST_PREFIX } } });
  await prisma.testimonial.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.expansionOpportunity.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.renewal.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.offboardingRecord.deleteMany({ where: { clientId: { in: ids } } });
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

/** Whether the archive gate still blocks on the client keeping their own access. */
async function adminAccessBlocks() {
  const stage = await prisma.pipelineStage.findFirstOrThrow({
    where: { stageKey: "archived", isDeprecated: false },
    select: {
      requirements: {
        select: { requirementKey: true, label: true, isBlocking: true },
        orderBy: { position: "asc" },
      },
    },
  });

  const client = await loadClientForEvaluation(clientId);
  assert.ok(client);

  // `unmet` rather than `blocking`: this requirement is still advisory, so an
  // unsatisfied one would not appear in `blocking` at all.
  return evaluateStageRequirements(client, stage.requirements).unmet.some(
    (item) => item.key === "client_admin_access_confirmed",
  );
}

describe("renewal, advocacy and offboarding (integration)", { skip: !hasDatabase }, () => {
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

    const [pm, specialist, sales] = await Promise.all([
      makeUser("Phase9 PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("Phase9 Specialist", "specialist", TeamRole.CREATIVE_SPECIALIST),
      makeUser("Phase9 Sales", "sales", TeamRole.SALES_REP),
    ]);

    pmId = pm.id;
    specialistId = specialist.id;
    salesId = sales.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "ongoing_management", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Phase9 Contact",
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

  // --- Renewal -------------------------------------------------------------

  it("refuses renewal management to a specialist", async () => {
    const specialist = await loadAuthContext(specialistId);
    assert.ok(specialist);

    const result = await saveRenewal({
      actor: specialist,
      clientId,
      stage: "REVIEW_SCHEDULED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("records an in-flight renewal without demanding an outcome", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveRenewal({
      actor: pm,
      clientId,
      stage: "REVIEW_SCHEDULED",
      renewalDate: new Date("2026-11-01T00:00:00.000Z"),
      currentValue: 2500,
    });

    assert.equal(result.ok, true);
  });

  it("copies the renewal date onto the account so the gate and dashboards agree", async () => {
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: { renewalDate: true },
    });

    assert.ok(client.renewalDate);
    assert.equal(client.renewalDate.toISOString().slice(0, 10), "2026-11-01");
  });

  it("refuses to settle a renewal with no reasoning recorded", async () => {
    // A churn with no reason is the most expensive blank field in an agency.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveRenewal({ actor: pm, clientId, stage: "CHURNED" });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("settles a renewal when the reasoning is there, and tells leadership", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveRenewal({
      actor: pm,
      clientId,
      stage: "CHURNED",
      outcomeNote: "They brought paid media in-house after hiring a marketing manager.",
    });

    assert.equal(result.ok, true);

    const notified = await prisma.notification.findMany({
      where: { entityId: clientId, urgency: "CRITICAL" },
      select: { title: true },
    });
    assert.ok(notified.some((item) => /not renewing/i.test(item.title)));
  });

  it("refuses to close an expansion opportunity with no outcome", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveExpansion({
      actor: pm,
      clientId,
      type: "CROSS_SELL",
      status: "LOST",
      title: "Add Google Ads alongside Meta",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  // --- Testimonials --------------------------------------------------------

  it("records a testimonial request", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveTestimonial({
      actor: pm,
      clientId,
      format: "WRITTEN",
      status: "RECEIVED",
      content: "They rebuilt our booking funnel and calls doubled.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.testimonial.receivedAt);
  });

  it("refuses to publish a testimonial the client has consented to nothing on", async () => {
    // The only place in this system where getting it wrong reaches people
    // outside the agency.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const existing = await prisma.testimonial.findFirstOrThrow({
      where: { clientId },
      select: { id: true },
    });

    const result = await saveTestimonial({
      actor: pm,
      clientId,
      testimonialId: existing.id,
      format: "WRITTEN",
      status: "PUBLISHED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NO_PERMISSION");
    assert.match(result.message, /not agreed/i);
  });

  it("refuses to publish with consent but nowhere recorded to publish it", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const existing = await prisma.testimonial.findFirstOrThrow({
      where: { clientId },
      select: { id: true },
    });

    const result = await saveTestimonial({
      actor: pm,
      clientId,
      testimonialId: existing.id,
      format: "WRITTEN",
      status: "PUBLISHED",
      allowBusinessName: true,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NO_PERMISSION");
  });

  it("publishes once consent and a destination are both recorded", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const existing = await prisma.testimonial.findFirstOrThrow({
      where: { clientId },
      select: { id: true },
    });

    const result = await saveTestimonial({
      actor: pm,
      clientId,
      testimonialId: existing.id,
      format: "WRITTEN",
      status: "PUBLISHED",
      allowBusinessName: true,
      allowPersonName: true,
      publishingChannels: "Website case studies page",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.testimonial.status, "PUBLISHED");
    assert.equal(result.testimonial.approvedById, pmId);
  });

  it("will not quietly revive a testimonial the client declined", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const declined = await prisma.testimonial.create({
      data: { clientId, format: "VIDEO", status: "DECLINED" },
      select: { id: true },
    });

    const result = await saveTestimonial({
      actor: pm,
      clientId,
      testimonialId: declined.id,
      format: "VIDEO",
      status: "RECEIVED",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NO_PERMISSION");
  });

  // --- Referrals -----------------------------------------------------------

  it("records a referral without permission, but will not move it along", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const created = await saveReferral({
      actor: pm,
      clientId,
      contactName: `${TEST_PREFIX} Dana Reyes`,
      businessName: "Reyes Plumbing",
    });

    assert.equal(created.ok, true);
    if (!created.ok) return;
    referralId = created.referral.id;

    const moved = await saveReferral({
      actor: pm,
      clientId,
      referralId,
      contactName: `${TEST_PREFIX} Dana Reyes`,
      status: "CONTACTED",
    });

    assert.equal(moved.ok, false);
    if (moved.ok) return;
    assert.equal(moved.code, "NO_PERMISSION");
  });

  it("refuses to hand an unpermitted referral to Sales", async () => {
    // Cold-calling somebody's friend on a name mentioned in passing loses both.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await convertReferralToLead({ actor: pm, referralId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NO_PERMISSION");
  });

  it("converts to a lead once the client has agreed to the introduction", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    await saveReferral({
      actor: pm,
      clientId,
      referralId,
      contactName: `${TEST_PREFIX} Dana Reyes`,
      businessName: "Reyes Plumbing",
      permissionGranted: true,
    });

    const result = await convertReferralToLead({
      actor: pm,
      referralId,
      assignedToId: salesId,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.lead.source, "REFERRAL");
    assert.equal(result.lead.assignedToId, salesId);
    assert.equal(result.referral.status, "CONTACTED");
    assert.match(result.lead.notes ?? "", /Referred by/);
  });

  it("refuses to convert the same referral twice", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await convertReferralToLead({ actor: pm, referralId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "ALREADY_CONVERTED");
  });

  it("falls back to the person's name when a referral has no business", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const created = await saveReferral({
      actor: pm,
      clientId,
      contactName: `${TEST_PREFIX} Sam Okafor`,
      permissionGranted: true,
    });

    assert.equal(created.ok, true);
    if (!created.ok) return;

    const result = await convertReferralToLead({
      actor: pm,
      referralId: created.referral.id,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.lead.businessName, `${TEST_PREFIX} Sam Okafor`);
  });

  // --- Offboarding ---------------------------------------------------------

  it("blocks the archive gate while no offboarding record exists", async () => {
    assert.equal(await adminAccessBlocks(), true);
  });

  it("starts offboarding and alerts leadership", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveOffboarding({
      actor: pm,
      clientId,
      reason: "CLIENT_CANCELLED",
      reasonDetail: "Brought paid media in-house.",
    });

    assert.equal(result.ok, true);

    const notified = await prisma.notification.findMany({
      where: { entityId: clientId },
      select: { title: true },
    });
    assert.ok(notified.some((item) => /Offboarding started/i.test(item.title)));
  });

  it("refuses to record agency access removed before the client is an administrator", async () => {
    // The one step here the agency cannot undo afterwards: done in the wrong
    // order it can leave a business locked out of its own accounts.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveOffboarding({
      actor: pm,
      clientId,
      completeSteps: ["agencyAccessRemovedAt"],
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "OUT_OF_ORDER");
    assert.match(result.message, /administrator/i);
  });

  it("accepts the removal once the client is confirmed as administrator", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const confirmed = await saveOffboarding({
      actor: pm,
      clientId,
      completeSteps: ["clientAdminAccessConfirmedAt"],
    });
    assert.equal(confirmed.ok, true);

    const removed = await saveOffboarding({
      actor: pm,
      clientId,
      completeSteps: ["agencyAccessRemovedAt"],
    });
    assert.equal(removed.ok, true);
  });

  it("clears the archive gate once the client keeps their own access", async () => {
    assert.equal(await adminAccessBlocks(), false);
  });

  it("refuses to un-confirm administrator access while agency access is already gone", async () => {
    // Undoing the confirmation would recreate exactly the state the ordering
    // rule exists to prevent.
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveOffboarding({
      actor: pm,
      clientId,
      clearSteps: ["clientAdminAccessConfirmedAt"],
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "OUT_OF_ORDER");
  });

  it("refuses to mark offboarding complete with steps outstanding, and names them", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveOffboarding({ actor: pm, clientId, status: "COMPLETE" });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INCOMPLETE");
    assert.ok((result.outstanding ?? []).length > 0);
    assert.ok((result.outstanding ?? []).some((item) => /billing/i.test(item)));
  });

  it("completes once every step is done", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await saveOffboarding({
      actor: pm,
      clientId,
      status: "COMPLETE",
      remainingWork: "Nothing outstanding.",
      completeSteps: [
        "finalBillingSettledAt",
        "assetsTransferredAt",
        "dataExportedAt",
        "finalReportSentAt",
      ],
      lessonsLearned: "Start the renewal conversation earlier than 30 days out.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.record.status, "COMPLETE");
    assert.ok(result.record.clientConfirmedAt);
  });
});
