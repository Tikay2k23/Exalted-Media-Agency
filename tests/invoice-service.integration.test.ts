import "dotenv/config";

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { Role, TeamRole } from "@prisma/client";

import { loadAuthContext } from "@/lib/authz";
import { createInvoice, recordPayment } from "@/lib/finance/invoice-service";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { prisma } from "@/lib/prisma";

const TEST_PREFIX = "zz-invoice-test";
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

let clientId = "";
let ownerId = "";
let pmId = "";

async function cleanup() {
  const clients = await prisma.client.findMany({
    where: { companyName: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = clients.map((client) => client.id);

  const invoices = await prisma.invoice.findMany({
    where: { clientId: { in: ids } },
    select: { id: true },
  });

  await prisma.payment.deleteMany({
    where: { invoiceId: { in: invoices.map((invoice) => invoice.id) } },
  });
  await prisma.invoice.deleteMany({ where: { clientId: { in: ids } } });
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

async function paymentBlocked() {
  const stage = await prisma.pipelineStage.findFirstOrThrow({
    where: { stageKey: "in_production", isDeprecated: false },
    select: {
      requirements: {
        select: { requirementKey: true, label: true, isBlocking: true },
        orderBy: { position: "asc" },
      },
    },
  });

  const client = await loadClientForEvaluation(clientId);
  assert.ok(client);

  const gate = evaluateStageRequirements(client, stage.requirements);
  return gate.blocking.some((item) => item.key === "payment_confirmed");
}

describe("invoicing and payments (integration)", { skip: !hasDatabase }, () => {
  before(async () => {
    await cleanup();

    const [owner, pm] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Invoice Test Owner",
          email: `${TEST_PREFIX}-owner@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.AGENCY_OWNER,
        },
        select: { id: true },
      }),
      prisma.user.create({
        data: {
          name: "Invoice Test PM",
          email: `${TEST_PREFIX}-pm@example.test`,
          passwordHash: "not-a-real-hash",
          role: Role.TEAM_MEMBER,
          teamRole: TeamRole.PROJECT_MANAGER,
        },
        select: { id: true },
      }),
    ]);

    ownerId = owner.id;
    pmId = pm.id;

    const stage = await prisma.pipelineStage.findFirstOrThrow({
      where: { stageKey: "payment_received", isDeprecated: false },
      select: { id: true },
    });

    const client = await prisma.client.create({
      data: {
        clientName: "Invoice Test Contact",
        companyName: `${TEST_PREFIX} Holdings`,
        contactEmail: `${TEST_PREFIX}@example.test`,
        serviceType: "SEO",
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

  it("refuses invoicing to a seat without finance authority", async () => {
    const pm = await loadAuthContext(pmId);
    assert.ok(pm);

    const result = await createInvoice({
      actor: pm,
      clientId,
      data: { amountDue: 1000 },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "FORBIDDEN");
  });

  it("blocks production while no invoice exists", async () => {
    assert.equal(await paymentBlocked(), true);
  });

  it("raises an invoice with a readable sequential number", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await createInvoice({
      actor: owner,
      clientId,
      data: { amountDue: 1000, dueAt: "2026-09-01" },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.invoice.invoiceNumber, /^INV-\d{6}$/);
    assert.equal(result.invoice.status, "SENT");
  });

  it("still blocks production while the invoice is unpaid", async () => {
    assert.equal(await paymentBlocked(), true);
  });

  it("marks the invoice part paid on a partial payment", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { clientId },
      select: { id: true },
    });

    const result = await recordPayment({
      actor: owner,
      invoiceId: invoice.id,
      data: { amount: 400, method: "BANK_TRANSFER", status: "SUCCEEDED" },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.invoiceStatus, "PARTIALLY_PAID");

    // Part paid is not paid: production stays blocked.
    assert.equal(await paymentBlocked(), true);
  });

  it("refuses a failed payment with no reason to chase", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { clientId },
      select: { id: true },
    });

    const result = await recordPayment({
      actor: owner,
      invoiceId: invoice.id,
      data: { amount: 100, method: "CARD", status: "FAILED" },
    });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "INVALID");
  });

  it("clears the payment gate once the balance is settled", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { clientId },
      select: { id: true },
    });

    const result = await recordPayment({
      actor: owner,
      invoiceId: invoice.id,
      data: { amount: 600, method: "BANK_TRANSFER", status: "SUCCEEDED" },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.invoiceStatus, "PAID");

    const settled = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { amountPaid: true, paidAt: true },
    });
    assert.equal(Number(settled.amountPaid), 1000);
    assert.ok(settled.paidAt);

    // The whole point: production is no longer blocked on money.
    assert.equal(await paymentBlocked(), false);
  });

  it("tells the account owner the money landed", async () => {
    const notifications = await prisma.notification.findMany({
      where: { entityId: clientId, recipientId: pmId },
      select: { title: true },
    });

    assert.ok(
      notifications.some((notification) => /Payment received/.test(notification.title)),
      "the account owner must be told production can begin",
    );
  });

  it("numbers a second invoice after the first", async () => {
    const owner = await loadAuthContext(ownerId);
    assert.ok(owner);

    const result = await createInvoice({
      actor: owner,
      clientId,
      data: { amountDue: 250 },
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const invoices = await prisma.invoice.findMany({
      where: { clientId },
      orderBy: { invoiceNumber: "asc" },
      select: { invoiceNumber: true },
    });

    assert.equal(invoices.length, 2);
    assert.notEqual(invoices[0].invoiceNumber, invoices[1].invoiceNumber);
  });

  it("keeps the gate satisfied once one invoice is paid, even with a newer one open", async () => {
    // A retainer client always has an open invoice. Requiring every invoice to
    // be settled would stall delivery permanently.
    assert.equal(await paymentBlocked(), false);
  });
});
