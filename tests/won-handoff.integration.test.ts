import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { findClientMatches } from "@/lib/sales/client-matching";
import { moveLeadStage } from "@/lib/sales/sales-actions";
import {
  confirmHandoffPayment,
  getWonPreview,
  markLeadWon,
  retryHandoff,
} from "@/lib/sales/won-service";

/**
 * The Sales -> Won -> Client -> Journey handoff, against a real database.
 *
 * Everything created here is namespaced with TEST_PREFIX and removed in the
 * cleanup hook, so this can run against a working database without leaving
 * anything behind.
 */

const TEST_PREFIX = "zz-won-test";

const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

interface Fixtures {
  ownerId: string;
  salesRepId: string;
  managerId: string;
  automationId: string;
}

let fixtures: Fixtures | null = null;

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const clientIds = clients.map((client) => client.id);

  const leads = await prisma.lead.findMany({
    where: { businessName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const leadIds = leads.map((lead) => lead.id);

  await prisma.notification.deleteMany({
    where: {
      OR: [
        { recipient: { email: { startsWith: TEST_PREFIX } } },
        ...(clientIds.length ? [{ entityId: { in: clientIds } }] : []),
        ...(leadIds.length ? [{ entityId: { in: leadIds } }] : []),
      ],
    },
  });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { actor: { email: { startsWith: TEST_PREFIX } } },
        ...(clientIds.length ? [{ entityId: { in: clientIds } }] : []),
        ...(leadIds.length ? [{ entityId: { in: leadIds } }] : []),
      ],
    },
  });

  await prisma.leadHandoff.deleteMany({
    where: { lead: { businessName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.employeeTask.deleteMany({
    where: {
      OR: [
        { client: { companyName: { startsWith: TEST_PREFIX } } },
        { lead: { businessName: { startsWith: TEST_PREFIX } } },
      ],
    },
  });
  await prisma.invoice.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.contract.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.onboardingRecord.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.clientWorkstream.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.clientStageHistory.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.clientContact.deleteMany({
    where: { client: { companyName: { startsWith: TEST_PREFIX } } },
  });
  await prisma.lead.deleteMany({ where: { businessName: { startsWith: TEST_PREFIX } } });
  await prisma.client.deleteMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
  });
  await prisma.user.deleteMany({ where: { email: { startsWith: TEST_PREFIX } } });
}

let leadCounter = 0;

async function makeLead(overrides: {
  businessName?: string;
  email?: string | null;
  phone?: string | null;
  contactName?: string;
} = {}) {
  leadCounter += 1;

  return prisma.lead.create({
    data: {
      contactName: overrides.contactName ?? `Contact ${leadCounter}`,
      businessName: overrides.businessName ?? `${TEST_PREFIX} Business ${leadCounter}`,
      email:
        overrides.email === undefined
          ? `${TEST_PREFIX}-lead-${leadCounter}@example.test`
          : overrides.email,
      phone: overrides.phone === undefined ? `555010${leadCounter}` : overrides.phone,
      source: "REFERRAL",
      serviceInterest: "CRM_AUTOMATION",
      proposalValue: 2500,
      assignedToId: fixtures!.salesRepId,
      notes: "Original sales notes that must survive the handoff.",
    },
    select: { id: true, businessName: true },
  });
}

describe("sales won handoff (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const [owner, rep, manager, automation] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Won Test Owner",
          email: `${TEST_PREFIX}-owner@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.ADMIN,
          teamRole: TeamRole.AGENCY_OWNER,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Won Test Rep",
          email: `${TEST_PREFIX}-rep@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.SALES_REP,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Won Test Manager",
          email: `${TEST_PREFIX}-manager@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.PROJECT_MANAGER,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Won Test Automation",
          email: `${TEST_PREFIX}-automation@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.AUTOMATION_SPECIALIST,
        },
        select: { id: true },
      }),
    ]);

    fixtures = {
      ownerId: owner.id,
      salesRepId: rep.id,
      managerId: manager.id,
      automationId: automation.id,
    };
  });

  after(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /* ---------------------------------------------------------------------- */
  /* Won + Paid + new client                                                */
  /* ---------------------------------------------------------------------- */

  it("creates the client, journey, billing, onboarding and tasks when paid", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    const result = await markLeadWon({
      actor,
      leadId: lead.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 4200,
        contractStatus: "SIGNED",
        paymentStatus: "PAID",
        expectedStartDate: null,
        handoffNote: "Wants the CRM live before the quarter ends.",
        projectManagerId: fixtures!.managerId,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(result.ok, "the handoff should complete");
    assert.equal(result.state, "COMPLETED");
    assert.ok(result.clientId);
    assert.equal(result.linkedExistingClient, false);
    assert.ok(result.generatedTaskCount > 0, "onboarding tasks should be generated");

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: result.clientId! },
      select: {
        companyName: true,
        serviceType: true,
        assignedUserId: true,
        monthlyValue: true,
        notes: true,
        currentStage: { select: { stageKey: true } },
        stageHistory: { select: { id: true } },
        workstreams: { select: { role: true, ownerId: true } },
        onboarding: { select: { id: true } },
        contracts: { select: { agreementStatus: true, contractValue: true } },
        invoices: { select: { status: true, amountPaid: true } },
        contacts: { select: { isPrimary: true } },
      },
    });

    // The journey starts at Payment Received, using the existing stage system.
    assert.equal(client.currentStage.stageKey, "payment_received");
    assert.equal(client.stageHistory.length, 1, "the journey records its first entry");
    assert.equal(client.assignedUserId, fixtures!.managerId);
    assert.equal(Number(client.monthlyValue), 4200);
    assert.ok(client.onboarding, "the onboarding record is opened");
    assert.equal(client.contacts.length, 1);

    // Sales context carried across rather than retyped.
    assert.ok(client.notes?.includes("Original sales notes"));
    assert.ok(client.notes?.includes("Sales handoff note"));
    assert.ok(client.notes?.includes("REFERRAL"));

    // Money lands in the commercial records the stage gates already read.
    assert.equal(client.contracts.length, 1);
    assert.equal(client.contracts[0].agreementStatus, "SIGNED");
    assert.equal(client.invoices.length, 1);
    assert.equal(client.invoices[0].status, "PAID");
    assert.equal(Number(client.invoices[0].amountPaid), 4200);

    // CRM automation opens sales, the project manager and the automation seat.
    const roles = client.workstreams.map((stream) => stream.role).sort();
    assert.deepEqual(roles, ["AUTOMATION_SPECIALIST", "PROJECT_MANAGER", "SALES_REP"]);

    // The sales record survives in full.
    const closed = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      select: {
        status: true,
        wonAt: true,
        wonById: true,
        finalValue: true,
        notes: true,
        convertedClientId: true,
        stage: { select: { stageKey: true } },
      },
    });

    assert.equal(closed.status, "CONVERTED");
    assert.equal(closed.convertedClientId, result.clientId);
    assert.equal(closed.wonById, fixtures!.ownerId);
    assert.ok(closed.wonAt);
    assert.equal(Number(closed.finalValue), 4200);
    assert.equal(closed.stage?.stageKey, "won", "it stays visible in Sales under Won");
    assert.ok(
      closed.notes?.includes("Original sales notes"),
      "the lead keeps its own history",
    );
  });

  /* ---------------------------------------------------------------------- */
  /* Won + payment pending                                                  */
  /* ---------------------------------------------------------------------- */

  it("records the win but starts nothing while payment is pending", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    const result = await markLeadWon({
      actor,
      leadId: lead.id,
      data: {
        serviceType: "PAID_ADVERTISING",
        finalValue: 1800,
        contractStatus: "SENT",
        paymentStatus: "PENDING",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: fixtures!.managerId,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(result.ok);
    assert.equal(result.state, "AWAITING_PAYMENT");
    assert.equal(result.clientId, null, "no account exists before the money does");
    assert.equal(result.generatedTaskCount, 0);

    const closed = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      select: {
        status: true,
        wonAt: true,
        convertedClientId: true,
        stage: { select: { stageKey: true } },
      },
    });

    assert.ok(closed.wonAt, "the win is recorded");
    assert.equal(closed.stage?.stageKey, "won", "and it shows in the Won column");
    // Status becomes CONVERTED only alongside a client record. Marking it
    // converted with nothing to point at would be wrong in every report that
    // joins the two.
    assert.notEqual(closed.status, "CONVERTED");
    assert.equal(closed.convertedClientId, null);
  });

  /* ---------------------------------------------------------------------- */
  /* Payment confirmed later                                                */
  /* ---------------------------------------------------------------------- */

  it("continues the handoff when the payment is confirmed later", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    const pending = await markLeadWon({
      actor,
      leadId: lead.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 900,
        contractStatus: "SIGNED",
        paymentStatus: "PENDING",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: fixtures!.managerId,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(pending.ok);
    assert.equal(pending.clientId, null);

    const confirmed = await confirmHandoffPayment({ actor, leadId: lead.id });

    assert.ok(confirmed.ok);
    assert.equal(confirmed.state, "COMPLETED");
    assert.ok(confirmed.clientId);
    assert.ok(confirmed.generatedTaskCount > 0);

    const closed = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      select: { status: true, convertedClientId: true },
    });

    assert.equal(closed.status, "CONVERTED");
    assert.equal(closed.convertedClientId, confirmed.clientId);

    const handoff = await prisma.leadHandoff.findUniqueOrThrow({
      where: { leadId: lead.id },
      select: { paymentStatus: true, paymentConfirmedById: true, completedAt: true },
    });

    assert.equal(handoff.paymentStatus, "PAID");
    assert.equal(handoff.paymentConfirmedById, fixtures!.ownerId);
    assert.ok(handoff.completedAt);
  });

  /* ---------------------------------------------------------------------- */
  /* Duplicate detection                                                    */
  /* ---------------------------------------------------------------------- */

  it("refuses to create a second account when the email already exists", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const first = await makeLead({ email: `${TEST_PREFIX}-dupe@example.test` });

    const created = await markLeadWon({
      actor,
      leadId: first.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 100,
        contractStatus: "SIGNED",
        paymentStatus: "PAID",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: fixtures!.managerId,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(created.ok);

    // A different business name, same email address.
    const second = await makeLead({
      email: `${TEST_PREFIX}-dupe@example.test`,
      businessName: `${TEST_PREFIX} Totally Different Name`,
    });

    const blocked = await markLeadWon({
      actor,
      leadId: second.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 100,
        contractStatus: "SIGNED",
        paymentStatus: "PAID",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: fixtures!.managerId,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.equal(blocked.ok, false);
    assert.equal(blocked.ok === false && blocked.code, "DUPLICATE_CLIENT");
    assert.ok(
      blocked.ok === false && blocked.matches?.some((match) => match.confidence === "email"),
      "the matching account is offered rather than only refused",
    );

    // No handoff row was written, so the deal can still be closed properly.
    const handoff = await prisma.leadHandoff.findUnique({
      where: { leadId: second.id },
      select: { id: true },
    });

    assert.equal(handoff, null);
  });

  it("matches on phone and on business name too", async () => {
    const lead = await makeLead({
      email: `${TEST_PREFIX}-unique-email@example.test`,
      phone: "5550999",
      businessName: `${TEST_PREFIX} Phone Match Co`,
    });

    await prisma.client.create({
      data: {
        clientName: "Someone Else",
        companyName: `${TEST_PREFIX} Phone Match Co`,
        contactEmail: `${TEST_PREFIX}-other@example.test`,
        contactPhone: "555-0999",
        serviceType: "CRM_AUTOMATION",
        currentStageId: (
          await prisma.pipelineStage.findFirstOrThrow({
            where: { stageKey: "payment_received", isDeprecated: false },
            select: { id: true },
          })
        ).id,
      },
    });

    const matches = await findClientMatches({
      id: lead.id,
      contactId: null,
      contactName: "Someone",
      businessName: `${TEST_PREFIX} Phone Match Co`,
      email: `${TEST_PREFIX}-unique-email@example.test`,
      phone: "5550999",
    });

    assert.ok(matches.length > 0);
    // Phone outranks company name, and formatting differences do not hide it.
    assert.equal(matches[0].confidence, "phone");
    assert.equal(matches[0].isStrong, true);
  });

  it("links to the existing account rather than duplicating it", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const existing = await prisma.client.findFirstOrThrow({
      where: { companyName: { startsWith: TEST_PREFIX } },
      select: { id: true, companyName: true },
    });

    const before = await prisma.client.count({
      where: { companyName: { startsWith: TEST_PREFIX } },
    });

    const lead = await makeLead();

    const result = await markLeadWon({
      actor,
      leadId: lead.id,
      data: {
        serviceType: "PAID_ADVERTISING",
        finalValue: 750,
        contractStatus: "SIGNED",
        paymentStatus: "PAID",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: fixtures!.managerId,
        linkClientId: existing.id,
        overrideDuplicate: false,
      },
    });

    assert.ok(result.ok);
    assert.equal(result.clientId, existing.id);
    assert.equal(result.linkedExistingClient, true);

    const after = await prisma.client.count({
      where: { companyName: { startsWith: TEST_PREFIX } },
    });

    assert.equal(after, before, "no second account was created");

    // The linked account keeps the journey it already had.
    const linked = await prisma.client.findUniqueOrThrow({
      where: { id: existing.id },
      select: { currentStage: { select: { stageKey: true } } },
    });

    assert.equal(linked.currentStage.stageKey, "payment_received");

    // The new service opened its seats on the existing account.
    const streams = await prisma.clientWorkstream.findMany({
      where: { clientId: existing.id },
      select: { role: true },
    });

    assert.ok(streams.some((stream) => stream.role === "ADS_SPECIALIST"));
  });

  /* ---------------------------------------------------------------------- */
  /* Idempotency                                                            */
  /* ---------------------------------------------------------------------- */

  it("does not duplicate anything when Confirm Won is clicked twice", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    const payload = {
      serviceType: "CRM_AUTOMATION" as const,
      finalValue: 300,
      contractStatus: "SIGNED" as const,
      paymentStatus: "PAID" as const,
      expectedStartDate: null,
      handoffNote: null,
      projectManagerId: fixtures!.managerId,
      linkClientId: null,
      overrideDuplicate: false,
    };

    const first = await markLeadWon({ actor, leadId: lead.id, data: payload });
    const second = await markLeadWon({ actor, leadId: lead.id, data: payload });

    assert.ok(first.ok);
    assert.ok(second.ok);
    assert.equal(second.alreadyProcessed, true);
    assert.equal(second.clientId, first.clientId);

    const clientId = first.clientId!;

    const [handoffs, tasks, invoices, contracts, histories] = await Promise.all([
      prisma.leadHandoff.count({ where: { leadId: lead.id } }),
      prisma.employeeTask.count({ where: { clientId, leadId: lead.id } }),
      prisma.invoice.count({ where: { clientId } }),
      prisma.contract.count({ where: { clientId } }),
      prisma.clientStageHistory.count({ where: { clientId } }),
    ]);

    assert.equal(handoffs, 1);
    assert.equal(invoices, 1);
    assert.equal(contracts, 1);
    assert.equal(histories, 1);
    assert.equal(tasks, first.generatedTaskCount, "tasks were created exactly once");

    const clientsForLead = await prisma.client.count({
      where: { salesHandoffs: { some: { leadId: lead.id } } },
    });

    assert.equal(clientsForLead, 1);
  });

  it("re-running a completed handoff changes nothing", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    const first = await markLeadWon({
      actor,
      leadId: lead.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 500,
        contractStatus: "SIGNED",
        paymentStatus: "PAID",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: fixtures!.managerId,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(first.ok);

    const taskCountBefore = await prisma.employeeTask.count({
      where: { clientId: first.clientId!, leadId: lead.id },
    });

    const retried = await retryHandoff({ actor, leadId: lead.id });

    assert.ok(retried.ok);
    assert.equal(retried.alreadyProcessed, true);

    const taskCountAfter = await prisma.employeeTask.count({
      where: { clientId: first.clientId!, leadId: lead.id },
    });

    assert.equal(taskCountAfter, taskCountBefore);
  });

  it("resumes a failed handoff at the step that failed, without repeating", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    const first = await markLeadWon({
      actor,
      leadId: lead.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 640,
        contractStatus: "SIGNED",
        paymentStatus: "PAID",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: fixtures!.managerId,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(first.ok);

    const clientId = first.clientId!;

    /*
     * Rewind to the state a crash during task creation would leave: the client,
     * billing and onboarding all exist and are stamped, the tasks do not. This
     * is exactly what the per-step timestamps are for.
     */
    await prisma.employeeTask.deleteMany({ where: { clientId, leadId: lead.id } });
    await prisma.leadHandoff.update({
      where: { leadId: lead.id },
      data: {
        state: "FAILED",
        failedStep: "tasks",
        failureMessage: "Simulated failure during task creation.",
        tasksCreatedAt: null,
        notifiedAt: null,
        completedAt: null,
      },
    });

    const retried = await retryHandoff({ actor, leadId: lead.id });

    assert.ok(retried.ok, "the retry should complete the handoff");
    assert.equal(retried.state, "COMPLETED");
    assert.equal(retried.clientId, clientId, "it resumes on the same account");
    assert.ok(retried.generatedTaskCount > 0);

    const [clients, contracts, invoices, histories, contacts, tasks] = await Promise.all([
      prisma.client.count({ where: { salesHandoffs: { some: { leadId: lead.id } } } }),
      prisma.contract.count({ where: { clientId } }),
      prisma.invoice.count({ where: { clientId } }),
      prisma.clientStageHistory.count({ where: { clientId } }),
      prisma.clientContact.count({ where: { clientId } }),
      prisma.employeeTask.count({ where: { clientId, leadId: lead.id } }),
    ]);

    // The steps that had already succeeded were not run again.
    assert.equal(clients, 1);
    assert.equal(contracts, 1);
    assert.equal(invoices, 1);
    assert.equal(histories, 1);
    assert.equal(contacts, 1);
    assert.equal(tasks, retried.generatedTaskCount);

    const handoff = await prisma.leadHandoff.findUniqueOrThrow({
      where: { leadId: lead.id },
      select: { state: true, failedStep: true, failureMessage: true, attemptCount: true },
    });

    assert.equal(handoff.state, "COMPLETED");
    assert.equal(handoff.failedStep, null, "the failure is cleared once it succeeds");
    assert.equal(handoff.failureMessage, null);
    assert.ok(handoff.attemptCount >= 2, "both attempts are counted");
  });

  /* ---------------------------------------------------------------------- */
  /* Assignment, notifications, permissions                                 */
  /* ---------------------------------------------------------------------- */

  it("routes specialist work to the staffed seat", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    const result = await markLeadWon({
      actor,
      leadId: lead.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 1000,
        contractStatus: "SIGNED",
        paymentStatus: "PAID",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: fixtures!.managerId,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(result.ok);

    const tasks = await prisma.employeeTask.findMany({
      where: { clientId: result.clientId!, leadId: lead.id },
      select: { title: true, assignedToId: true },
    });

    assert.ok(tasks.length > 0);
    assert.ok(
      tasks.every((task) => task.assignedToId !== null),
      "every generated task has an owner",
    );
  });

  it("assigns onboarding work to the resolved manager, not to whoever clicked", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    /*
     * No project manager is picked, which is the common case: the handoff
     * resolves the least-loaded one. Every later step has to use that resolved
     * person, or the account names the right manager while their tasks sit in
     * the closer's My Work.
     */
    const result = await markLeadWon({
      actor,
      leadId: lead.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 1200,
        contractStatus: "SIGNED",
        paymentStatus: "PAID",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: null,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(result.ok);

    const handoff = await prisma.leadHandoff.findUniqueOrThrow({
      where: { leadId: lead.id },
      select: { projectManagerId: true },
    });

    assert.ok(handoff.projectManagerId, "a manager was resolved and recorded");
    assert.notEqual(
      handoff.projectManagerId,
      fixtures!.ownerId,
      "the resolved manager is a project manager, not the closer",
    );

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: result.clientId! },
      select: { assignedUserId: true, onboarding: { select: { ownerId: true } } },
    });

    assert.equal(client.assignedUserId, handoff.projectManagerId);
    assert.equal(
      client.onboarding?.ownerId,
      handoff.projectManagerId,
      "the onboarding record is owned by the manager",
    );

    const tasks = await prisma.employeeTask.findMany({
      where: { clientId: result.clientId!, leadId: lead.id },
      select: { title: true, assignedToId: true },
    });

    assert.ok(tasks.length > 0);
    assert.ok(
      tasks.every((task) => task.assignedToId === handoff.projectManagerId),
      "every onboarding task lands on the manager rather than the closer",
    );
  });

  it("numbers its invoice in the sequence the finance module owns", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    const result = await markLeadWon({
      actor,
      leadId: lead.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 1500,
        contractStatus: "SIGNED",
        paymentStatus: "PAID",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: fixtures!.managerId,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(result.ok);

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { clientId: result.clientId! },
      select: { invoiceNumber: true },
    });

    /*
     * The shape matters, not just uniqueness. nextInvoiceNumber picks the
     * highest number as text and parses it, so an invoice numbered any other
     * way sorts above the real ones, parses as NaN, and resets the sequence to
     * 1 - which then collides with a number already issued. A handoff invoice
     * numbered "INV-VMV6CDUZ" once broke every invoice raised afterwards.
     */
    assert.match(
      invoice.invoiceNumber,
      /^INV-\d{6}$/,
      "the handoff must use the finance module's numbering, not its own",
    );

    const parsed = Number.parseInt(invoice.invoiceNumber.slice(4), 10);

    assert.ok(Number.isFinite(parsed), "the number has to parse back to an integer");
  });

  it("notifies the people who have to act", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    const result = await markLeadWon({
      actor,
      leadId: lead.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 1000,
        contractStatus: "SIGNED",
        paymentStatus: "PAID",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: fixtures!.managerId,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(result.ok);

    const notifications = await prisma.notification.findMany({
      where: { entityId: result.clientId!, entityType: "CLIENT" },
      select: { recipientId: true, title: true },
    });

    assert.ok(notifications.length > 0, "somebody is told about the new client");
    assert.ok(
      notifications.every((entry) => entry.recipientId !== fixtures!.ownerId),
      "the person who did it is not notified about their own action",
    );
  });

  it("writes the handoff to the activity history", async () => {
    const lead = await prisma.lead.findFirstOrThrow({
      where: { businessName: { startsWith: TEST_PREFIX }, wonAt: { not: null } },
      select: { id: true },
    });

    const entries = await prisma.activityLog.findMany({
      where: { entityId: lead.id, entityType: "LEAD" },
      select: { action: true, actorId: true, createdAt: true },
    });

    assert.ok(entries.length > 0);
    assert.ok(entries.some((entry) => entry.action.includes("Won")));
    assert.ok(
      entries.every((entry) => entry.actorId && entry.createdAt),
      "every entry names a user and a time",
    );
  });

  it("does not let a sales representative confirm payment", async () => {
    const rep = await loadAuthContext(fixtures!.salesRepId);
    assert.ok(rep);

    const lead = await makeLead();

    const pending = await markLeadWon({
      actor: rep,
      leadId: lead.id,
      data: {
        serviceType: "CRM_AUTOMATION",
        finalValue: 200,
        contractStatus: "SENT",
        paymentStatus: "PENDING",
        expectedStartDate: null,
        handoffNote: null,
        projectManagerId: null,
        linkClientId: null,
        overrideDuplicate: false,
      },
    });

    assert.ok(pending.ok, "a rep may close their own deal");

    const denied = await confirmHandoffPayment({ actor: rep, leadId: lead.id });

    assert.equal(denied.ok, false);
    assert.equal(denied.ok === false && denied.code, "FORBIDDEN");
  });

  it("refuses to close a deal as Won through a plain stage move", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();

    /*
     * The bypass this closes: dragging a card onto the Won column used to post
     * a plain stage move, which marked the lead won and created no client, no
     * journey and no onboarding work. The board now opens the confirmation,
     * and this is the backstop for anything that does not.
     */
    const moved = await moveLeadStage({ actor, leadId: lead.id, stageKey: "won" });

    assert.equal(moved.ok, false);
    assert.equal(moved.ok === false && moved.code, "NEEDS_CONFIRMATION");

    const after = await prisma.lead.findUniqueOrThrow({
      where: { id: lead.id },
      select: {
        wonAt: true,
        convertedClientId: true,
        status: true,
        handoff: { select: { id: true } },
      },
    });

    assert.equal(after.wonAt, null, "nothing was recorded as won");
    assert.equal(after.convertedClientId, null);
    assert.equal(after.handoff, null, "and no handoff was started");
  });

  it("still allows ordinary stage moves", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();
    const moved = await moveLeadStage({ actor, leadId: lead.id, stageKey: "qualified" });

    assert.equal(moved.ok, true, "only Won is gated, not every move");
  });

  it("shows the confirmation dialog what it needs", async () => {
    const actor = await loadAuthContext(fixtures!.ownerId);
    assert.ok(actor);

    const lead = await makeLead();
    const preview = await getWonPreview(actor, lead.id);

    assert.ok(!("ok" in preview && preview.ok === false));

    if ("ok" in preview) return;

    assert.equal(preview.suggestedServiceType, "CRM_AUTOMATION");
    assert.equal(preview.suggestedValue, 2500);
    assert.deepEqual(preview.specialists, ["AUTOMATION_SPECIALIST"]);
    assert.equal(preview.canOverrideDuplicate, true);
    assert.equal(preview.existingHandoff, null);
  });
});
