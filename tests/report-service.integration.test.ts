import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  deliverReport,
  reviewReport,
  saveOptimization,
  saveReport,
  submitReportForReview,
} from "@/lib/success/report-service";

const TEST_PREFIX = "zz-report-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let adsId = "";
let pmId = "";
let creativeId = "";
let reportId = "";

const period = {
  periodStart: new Date("2026-07-01T00:00:00.000Z"),
  periodEnd: new Date("2026-07-31T00:00:00.000Z"),
};

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  await prisma.clientReport.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.optimization.deleteMany({ where: { clientId: { in: ids } } });
  await prisma.employeeTask.deleteMany({ where: { title: { startsWith: TEST_PREFIX } } });
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

describe("client reporting and optimization (integration)", { skip: !hasDatabase }, () => {
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

    const [ads, pm, creative] = await Promise.all([
      makeUser("Report Test Ads", "ads", TeamRole.ADS_SPECIALIST),
      makeUser("Report Test PM", "pm", TeamRole.PROJECT_MANAGER),
      makeUser("Report Test Creative", "creative", TeamRole.CREATIVE_SPECIALIST),
    ]);

    adsId = ads.id;
    pmId = pm.id;
    creativeId = creative.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "ongoing_management", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Report Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "FULL_SERVICE_RETAINER",
        currentStageId: stage.id,
        assignedUserId: pm.id,
      },
      select: { id: true },
    });

    clientId = client.id;

    // The ads specialist works this account through assigned work rather than
    // owning the relationship, which is the normal arrangement and the reason
    // reporting cannot be scoped by ownership alone.
    await prisma.employeeTask.create({
      data: {
        title: `${TEST_PREFIX} monthly performance reporting`,
        assignedToId: ads.id,
        clientId: client.id,
        dueDate: new Date(),
        weekStartDate: new Date(),
        status: "IN_PROGRESS",
      },
    });
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("refuses reporting to a creative specialist", async () => {
    // Reporting belongs to the ads seat, the PM and the owner. A creative
    // specialist has no business publishing performance numbers.
    const creative = await loadAuthContext(creativeId);
    assert.ok(creative);

    const result = await saveReport({
      actor: creative,
      clientId,
      type: "MONTHLY_REPORT",
      ...period,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("refuses a period that ends before it starts", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const result = await saveReport({
      actor: ads,
      clientId,
      type: "MONTHLY_REPORT",
      periodStart: period.periodEnd,
      periodEnd: period.periodStart,
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("refuses a period starting in the future", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const result = await saveReport({
      actor: ads,
      clientId,
      type: "MONTHLY_REPORT",
      periodStart: new Date(Date.now() + 86_400_000),
      periodEnd: new Date(Date.now() + 172_800_000),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("saves a draft and records who prepared it", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const result = await saveReport({
      actor: ads,
      clientId,
      type: "MONTHLY_REPORT",
      ...period,
      dataSources: "Meta Ads Manager, GA4, GoHighLevel opportunities",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    reportId = result.report.id;
    assert.equal(result.report.preparedById, adsId);
    assert.equal(result.report.status, "DRAFT");
    assert.equal(result.report.dataValidatedAt, null);
  });

  it("refuses to send it for review while the figures are unchecked", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const result = await submitReportForReview({ actor: ads, reportId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "UNVALIDATED_DATA");
  });

  it("accepts it for review once the figures are confirmed checked", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    await saveReport({
      actor: ads,
      clientId,
      reportId,
      type: "MONTHLY_REPORT",
      ...period,
      dataSources: "Meta Ads Manager, GA4, GoHighLevel opportunities",
      dataValidated: true,
    });

    const result = await submitReportForReview({ actor: ads, reportId });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.report.status, "IN_REVIEW");
  });

  it("keeps the validation timestamp when a later edit does not re-tick the box", async () => {
    // Otherwise editing a typo would silently discard the check somebody did.
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    await saveReport({
      actor: ads,
      clientId,
      reportId,
      type: "MONTHLY_REPORT",
      ...period,
      dataSources: "Meta Ads Manager, GA4, GoHighLevel opportunities (corrected)",
    });

    const report = await prisma.clientReport.findUniqueOrThrow({
      where: { id: reportId },
      select: { dataValidatedAt: true },
    });

    assert.ok(report.dataValidatedAt);
  });

  it("refuses to let the preparer approve their own report", async () => {
    // The same rule as QA and the strategy brief, for the same reason: this
    // one goes to the person paying for it.
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const result = await reviewReport({ actor: ads, reportId, approve: true });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "SELF_REVIEW");
  });

  it("refuses to send a report nobody has approved", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await deliverReport({ actor: pm, reportId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "NOT_APPROVED");
  });

  it("sends it back to draft with a note", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await reviewReport({
      actor: pm,
      reportId,
      approve: false,
      note: "The spend figure does not match what Ads Manager shows for July.",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.report.status, "DRAFT");

    const notified = await prisma.notification.findMany({
      where: { entityId: clientId, recipientId: adsId },
      select: { title: true },
    });
    assert.ok(notified.some((item) => /needs changes/i.test(item.title)));
  });

  it("refuses to send it back with no note", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await reviewReport({ actor: pm, reportId, approve: false, note: "  " });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("approves and sends once a second person has read it", async () => {
    const ads = await loadAuthContext(adsId);
    const pm = await loadAuthContext(pmId);
    assert.ok(ads && pm);

    await submitReportForReview({ actor: ads, reportId });

    const approved = await reviewReport({ actor: pm, reportId, approve: true });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    assert.equal(approved.report.reviewedById, pmId);

    const sent = await deliverReport({ actor: pm, reportId });
    assert.equal(sent.ok, true);
    if (!sent.ok) return;
    assert.equal(sent.report.status, "SENT");
    assert.ok(sent.report.sentAt);
  });

  it("refuses to edit a report the client is already holding", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const result = await saveReport({
      actor: ads,
      clientId,
      reportId,
      type: "MONTHLY_REPORT",
      ...period,
      dataSources: "Quietly changed after the fact",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
    assert.match(result.message, /already gone to the client/i);
  });

  it("records the client acknowledging it", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await deliverReport({ actor: pm, reportId, acknowledged: true });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.report.status, "ACKNOWLEDGED");
    assert.ok(result.report.clientAcknowledgedAt);
  });

  it("refuses to send the same report twice", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await deliverReport({ actor: pm, reportId });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });
  it("records one that is still running without demanding a result", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const result = await saveOptimization({
      actor: ads,
      clientId,
      platform: "Meta Ads",
      observedProblem: "Cost per lead climbed 40% over two weeks.",
      proposedChange: "Split the broad audience out into its own campaign.",
      previousSetting: "Single campaign, broad + lookalike in one ad set",
      newSetting: "Two campaigns, separate budgets",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.optimization.decision, "PENDING");
    assert.equal(result.optimization.ownerId, adsId);
  });

  it("refuses to conclude one with no result written down", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const existing = await prisma.optimization.findFirstOrThrow({
      where: { clientId },
      select: { id: true, platform: true, observedProblem: true, proposedChange: true, previousSetting: true },
    });

    const result = await saveOptimization({
      actor: ads,
      clientId,
      optimizationId: existing.id,
      platform: existing.platform,
      observedProblem: existing.observedProblem,
      proposedChange: existing.proposedChange,
      previousSetting: existing.previousSetting,
      decision: "KEEP",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
    assert.match(result.message, /what actually happened/i);
  });

  it("refuses to conclude one with no baseline to compare against", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const result = await saveOptimization({
      actor: ads,
      clientId,
      platform: "Google Ads",
      observedProblem: "Search impression share dropped.",
      proposedChange: "Raised the daily budget.",
      result: "Impression share recovered to 62%.",
      decision: "KEEP",
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
    assert.match(result.message, /before the change/i);
  });

  it("concludes one that has both a baseline and a result", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const existing = await prisma.optimization.findFirstOrThrow({
      where: { clientId },
      select: { id: true, platform: true, observedProblem: true, proposedChange: true },
    });

    const result = await saveOptimization({
      actor: ads,
      clientId,
      optimizationId: existing.id,
      platform: existing.platform,
      observedProblem: existing.observedProblem,
      proposedChange: existing.proposedChange,
      previousSetting: "Single campaign, broad + lookalike in one ad set",
      newSetting: "Two campaigns, separate budgets",
      result: "Cost per lead fell from 46 to 31 over three weeks.",
      decision: "KEEP",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.optimization.decision, "KEEP");
  });

  it("allows continue-testing without a result, because it is not a conclusion", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const result = await saveOptimization({
      actor: ads,
      clientId,
      platform: "Google Ads",
      observedProblem: "Search impression share dropped.",
      proposedChange: "Raised the daily budget.",
      decision: "CONTINUE_TESTING",
    });

    assert.equal(result.ok, true);
  });

  it("refuses a test that ends before it starts", async () => {
    const ads = await loadAuthContext(adsId);
    assert.ok(ads);

    const result = await saveOptimization({
      actor: ads,
      clientId,
      platform: "Meta Ads",
      observedProblem: "Frequency climbing.",
      proposedChange: "Refresh the creative.",
      startDate: new Date("2026-07-20T00:00:00.000Z"),
      endDate: new Date("2026-07-10T00:00:00.000Z"),
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });
});
