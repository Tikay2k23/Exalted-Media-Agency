import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { LeadSource, LeadStatus, Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  convertLeadToClient,
  createLead,
  leadVisibilityWhere,
  logLeadCall,
  updateLead,
} from "@/lib/sales/lead-service";

const TEST_PREFIX = "zz-sales-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

interface Fixtures {
  managerId: string;
  repId: string;
  otherRepId: string;
  specialistId: string;
}

let fixtures: Fixtures | null = null;

async function cleanup() {
  const leads = await prisma.lead.findMany({
    where: { businessName: { startsWith: TEST_PREFIX } },
    select: { id: true, convertedClientId: true },
  });
  const leadIds = leads.map((lead) => lead.id);
  const clientIds = leads
    .map((lead) => lead.convertedClientId)
    .filter((id): id is string => Boolean(id));

  const testClients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const allClientIds = [...new Set([...clientIds, ...testClients.map((c) => c.id)])];
  const entityIds = [...leadIds, ...allClientIds];

  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipient: { email: { startsWith: TEST_PREFIX } } },
        ...(entityIds.length ? [{ entityId: { in: entityIds } }] : []),
      ],
    },
  });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { actor: { email: { startsWith: TEST_PREFIX } } },
        ...(entityIds.length ? [{ entityId: { in: entityIds } }] : []),
      ],
    },
  });
  await prisma.leadCallLog.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.lead.deleteMany({ where: { businessName: { startsWith: TEST_PREFIX } } });

  if (allClientIds.length) {
    await prisma.employeeTask.deleteMany({ where: { clientId: { in: allClientIds } } });
    await prisma.clientStageHistory.deleteMany({
      where: { clientId: { in: allClientIds } },
    });
    await prisma.client.deleteMany({ where: { id: { in: allClientIds } } });
  }

  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

async function actorFor(userId: string) {
  const actor = await loadAuthContext(userId);
  assert.ok(actor);
  return actor;
}

describe("lead service (integration)", { skip: !hasDatabase }, () => {
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

    const [manager, rep, otherRep, specialist] = await Promise.all([
      makeUser("Agency Owner", "manager", TeamRole.AGENCY_OWNER),
      makeUser("Sales Rep", "rep", TeamRole.SALES_REP),
      makeUser("Other Rep", "otherrep", TeamRole.SALES_REP),
      makeUser("Creative Specialist", "specialist", TeamRole.CREATIVE_SPECIALIST),
    ]);

    fixtures = {
      managerId: manager.id,
      repId: rep.id,
      otherRepId: otherRep.id,
      specialistId: specialist.id,
    };
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const leadPayload = (label: string) => ({
    contactName: "Jamie Doe",
    businessName: `${TEST_PREFIX} ${label}`,
    email: "jamie@example.test",
    phone: "+1 555 0100",
    source: LeadSource.REFERRAL,
    budgetAmount: 6000,
    timeline: "ASAP",
    isDecisionMaker: true,
    mainProblem: "Lead flow dried up.",
    goal: "Twenty appointments a month.",
  });

  it("refuses lead creation to someone with no sales permission", async () => {
    const specialist = await actorFor(fixtures!.specialistId);
    const result = await createLead({ actor: specialist, data: leadPayload("Denied") });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("creates a lead, scores it, and places it on the sales pipeline", async () => {
    const manager = await actorFor(fixtures!.managerId);
    const result = await createLead({
      actor: manager,
      data: { ...leadPayload("Scored"), assignedToId: fixtures!.repId },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.lead.status, LeadStatus.NEW);
    assert.ok(result.lead.score !== null && result.lead.score >= 70);
    assert.equal(result.lead.assignedToId, fixtures!.repId);

    const stage = await prisma.pipelineStage.findUniqueOrThrow({
      where: { id: result.lead.stageId! },
      select: { pipeline: { select: { kind: true } } },
    });
    assert.equal(stage.pipeline.kind, "SALES");
  });

  it("forces a lead onto its creator when they cannot see agency-wide leads", async () => {
    // Exercised through an explicit DENY override, which is how a second sales
    // rep would be scoped down to their own pipeline.
    await prisma.userPermissionOverride.create({
      data: {
        userId: fixtures!.repId,
        permission: "leads.view.all",
        effect: "DENY",
        reason: "Scoped to their own pipeline for this test.",
      },
    });

    const scopedRep = await actorFor(fixtures!.repId);
    const result = await createLead({
      actor: scopedRep,
      // The rep tries to hand this to somebody else.
      data: { ...leadPayload("SelfAssigned"), assignedToId: fixtures!.otherRepId },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.lead.assignedToId, fixtures!.repId);

    await prisma.userPermissionOverride.deleteMany({
      where: { userId: fixtures!.repId, permission: "leads.view.all" },
    });
  });

  it("hides leads entirely from a seat that has no sales role", async () => {
    const manager = await actorFor(fixtures!.managerId);
    const created = await createLead({
      actor: manager,
      data: { ...leadPayload("Hidden"), assignedToId: fixtures!.otherRepId },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    // A creative specialist holds neither leads.view.all nor leads.view.assigned,
    // so the lead is not merely unreadable, it does not exist for them.
    const specialist = await actorFor(fixtures!.specialistId);
    assert.equal(leadVisibilityWhere(specialist), null);

    const result = await updateLead({
      actor: specialist,
      leadId: created.lead.id,
      data: { timeline: "next month" },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("requires a reason before a lead can be marked lost", async () => {
    const manager = await actorFor(fixtures!.managerId);
    const created = await createLead({ actor: manager, data: leadPayload("Lost") });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const withoutReason = await updateLead({
      actor: manager,
      leadId: created.lead.id,
      data: { status: LeadStatus.LOST },
    });
    assert.equal(withoutReason.ok, false);
    if (withoutReason.ok) return;
    assert.equal(withoutReason.code, "INVALID");

    const withReason = await updateLead({
      actor: manager,
      leadId: created.lead.id,
      data: { status: LeadStatus.LOST, lostReason: "Went with an in-house hire." },
    });
    assert.equal(withReason.ok, true);
  });

  it("recalculates the score when qualification facts change", async () => {
    const manager = await actorFor(fixtures!.managerId);
    const created = await createLead({
      actor: manager,
      data: {
        contactName: "Pat Roe",
        businessName: `${TEST_PREFIX} Rescore`,
        // A lead now needs one way to reach them, so this is the minimum a
        // lead can be created with rather than an incidental detail.
        email: "pat@rescore.test",
        source: LeadSource.OUTBOUND,
      },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const before = created.lead.score ?? 0;

    const updated = await updateLead({
      actor: manager,
      leadId: created.lead.id,
      data: { budgetAmount: 12_000, isDecisionMaker: true, timeline: "ASAP" },
    });

    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    assert.ok((updated.lead.score ?? 0) > before, "score should rise as the lead qualifies");
  });

  it("advances a new lead to contacted when a connected call is logged", async () => {
    const manager = await actorFor(fixtures!.managerId);
    const created = await createLead({ actor: manager, data: leadPayload("Called") });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const result = await logLeadCall({
      actor: manager,
      leadId: created.lead.id,
      data: { outcome: "CONNECTED", notes: "Good discovery call." },
    });

    assert.equal(result.ok, true);

    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: created.lead.id },
      select: { status: true },
    });
    assert.equal(lead.status, LeadStatus.CONTACTED);
  });

  it("marks a lead as attempting contact when the call did not connect", async () => {
    const manager = await actorFor(fixtures!.managerId);
    const created = await createLead({ actor: manager, data: leadPayload("NoAnswer") });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await logLeadCall({
      actor: manager,
      leadId: created.lead.id,
      data: { outcome: "NO_ANSWER" },
    });

    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: created.lead.id },
      select: { status: true },
    });
    assert.equal(lead.status, LeadStatus.ATTEMPTING_CONTACT);
  });

  it("converts a lead into a client and generates the onboarding work", async () => {
    const manager = await actorFor(fixtures!.managerId);
    const created = await createLead({
      actor: manager,
      data: { ...leadPayload("Converted"), assignedToId: fixtures!.repId },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const result = await convertLeadToClient({
      actor: manager,
      leadId: created.lead.id,
      data: { serviceType: "FULL_SERVICE_RETAINER", monthlyValue: 4000 },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    // The handoff must produce onboarding work, not just an empty account.
    assert.ok(result.generatedTaskCount > 0);

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: result.client.id },
      select: {
        companyName: true,
        assignedUserId: true,
        monthlyValue: true,
        currentStage: { select: { stageKey: true, pipeline: { select: { kind: true } } } },
        agencyTasks: { select: { category: true, assignedToId: true } },
        stageHistory: { select: { note: true } },
      },
    });

    assert.equal(client.currentStage.pipeline.kind, "FULFILLMENT");
    assert.equal(client.currentStage.stageKey, "payment_received");
    assert.equal(client.assignedUserId, fixtures!.repId);
    assert.equal(Number(client.monthlyValue), 4000);
    assert.equal(client.agencyTasks.length, result.generatedTaskCount);
    assert.ok(client.agencyTasks.every((task) => task.assignedToId));
    assert.equal(client.stageHistory.length, 1);

    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: created.lead.id },
      select: { status: true, convertedClientId: true, stage: { select: { stageKey: true } } },
    });
    assert.equal(lead.status, LeadStatus.CONVERTED);
    assert.equal(lead.convertedClientId, result.client.id);
    assert.equal(lead.stage?.stageKey, "won");
  });

  it("refuses to convert the same lead twice", async () => {
    const manager = await actorFor(fixtures!.managerId);
    const lead = await prisma.lead.findFirstOrThrow({
      where: { businessName: `${TEST_PREFIX} Converted` },
      select: { id: true },
    });

    const result = await convertLeadToClient({
      actor: manager,
      leadId: lead.id,
      data: { serviceType: "SEO" },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "ALREADY_CONVERTED");
  });

  it("refuses to edit a converted lead, so the handoff record stays intact", async () => {
    const manager = await actorFor(fixtures!.managerId);
    const lead = await prisma.lead.findFirstOrThrow({
      where: { businessName: `${TEST_PREFIX} Converted` },
      select: { id: true },
    });

    const result = await updateLead({
      actor: manager,
      leadId: lead.id,
      data: { timeline: "changed my mind" },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "ALREADY_CONVERTED");
  });

  it("lets a sales representative convert their own lead", async () => {
    const manager = await actorFor(fixtures!.managerId);
    /*
     * Its own contact details, unlike the shared ones in leadPayload.
     *
     * An earlier test in this suite converts a lead carrying jamie@example.test
     * into a client, and conversion now refuses a second account for an email
     * that already belongs to one. Reusing the shared payload here would fail
     * on that guard rather than on the permission this test is about.
     */
    const created = await createLead({
      actor: manager,
      data: {
        ...leadPayload("RepConvert"),
        email: `${TEST_PREFIX}-repconvert@example.test`,
        phone: "+1 555 0177",
        assignedToId: fixtures!.repId,
      },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const rep = await actorFor(fixtures!.repId);
    const result = await convertLeadToClient({
      actor: rep,
      leadId: created.lead.id,
      data: { serviceType: "SEO" },
    });

    // A rep holds leads.convert, so closing their own deal is allowed. What is
    // being pinned here is that the permission decides, not the access tier:
    // this user is a TEAM_MEMBER, the same tier as the copywriter who was
    // refused outright at the top of this suite.
    assert.equal(result.ok, true);
  });
});
