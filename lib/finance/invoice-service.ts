import {
  InvoiceStatus,
  type PaymentMethod,
  PaymentStatus,
  type Prisma,
} from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Invoicing and payment recording.
 *
 * The agency does not take payments here. This records what has been invoiced
 * and what has actually landed, which is what the "Payment confirmed" stage
 * gate reads before production may begin.
 */

export type FinanceFailureCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "ALREADY_SETTLED";

export interface FinanceFailure {
  ok: false;
  code: FinanceFailureCode;
  message: string;
}

function failure(code: FinanceFailureCode, message: string): FinanceFailure {
  return { ok: false, code, message };
}

/**
 * Works out an invoice's status from the payments recorded against it.
 *
 * Kept pure so the money arithmetic can be tested exhaustively without a
 * database, and so status can never drift from the payments that justify it.
 */
export function deriveInvoiceStatus(input: {
  amountDue: number;
  settledAmount: number;
  hasFailedPayment: boolean;
  dueAt: Date | null;
  now?: Date;
}): { status: InvoiceStatus; isSettled: boolean } {
  const { amountDue, settledAmount, hasFailedPayment } = input;
  const now = input.now ?? new Date();

  // A fully covered invoice is paid regardless of anything that failed on the
  // way there: a retried card should not leave the account looking delinquent.
  if (settledAmount >= amountDue && amountDue >= 0) {
    return { status: InvoiceStatus.PAID, isSettled: true };
  }

  if (hasFailedPayment) {
    return { status: InvoiceStatus.FAILED, isSettled: false };
  }

  if (settledAmount > 0) {
    return { status: InvoiceStatus.PARTIALLY_PAID, isSettled: false };
  }

  if (input.dueAt && input.dueAt < now) {
    return { status: InvoiceStatus.OVERDUE, isSettled: false };
  }

  return { status: InvoiceStatus.SENT, isSettled: false };
}

/**
 * Allocates the next human-readable invoice number.
 *
 * Runs inside the caller's transaction so two invoices raised at the same
 * moment cannot collide on the number.
 *
 * Exported because the sales handoff raises an invoice too. Every writer has
 * to come through here: the sequence is derived by sorting the existing
 * numbers as text and parsing the highest, so a single invoice numbered in any
 * other shape sorts above the real ones, parses as NaN, and resets the whole
 * sequence to 1 - colliding with a number already issued.
 */
export async function nextInvoiceNumber(transaction: Prisma.TransactionClient) {
  const latest = await transaction.invoice.findFirst({
    where: { invoiceNumber: { startsWith: "INV-" } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  const current = latest ? Number.parseInt(latest.invoiceNumber.slice(4), 10) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;

  return `INV-${String(next).padStart(6, "0")}`;
}

async function loadEditableClient(actor: AuthContext, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true, assignedUserId: true },
  });
}

export interface CreateInvoiceInput {
  actor: AuthContext;
  clientId: string;
  data: {
    amountDue: number;
    currency?: string;
    issuedAt?: string | null;
    dueAt?: string | null;
    notes?: string | null;
  };
}

export async function createInvoice(input: CreateInvoiceInput) {
  const { actor, clientId, data } = input;

  if (!can(actor, "finance.edit")) {
    return failure("FORBIDDEN", "You do not have permission to raise invoices.");
  }

  const client = await loadEditableClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  if (!Number.isFinite(data.amountDue) || data.amountDue < 0) {
    return failure("INVALID", "An invoice needs an amount of zero or more.");
  }

  const dueAt = data.dueAt ? new Date(data.dueAt) : null;
  const issuedAt = data.issuedAt ? new Date(data.issuedAt) : new Date();

  const invoice = await prisma.$transaction(async (transaction) => {
    const invoiceNumber = await nextInvoiceNumber(transaction);

    return transaction.invoice.create({
      data: {
        clientId: client.id,
        invoiceNumber,
        amountDue: data.amountDue,
        currency: data.currency?.trim() || "USD",
        status: InvoiceStatus.SENT,
        issuedAt,
        dueAt,
        notes: data.notes || null,
      },
    });
  });

  await logActivity({
    actorId: actor.id,
    action: `Raised invoice ${invoice.invoiceNumber} for ${client.companyName}`,
    entityType: "CONTRACT",
    entityId: client.id,
    metadataJson: { invoiceId: invoice.id, amountDue: data.amountDue },
  });

  return { ok: true as const, invoice };
}

export interface RecordPaymentInput {
  actor: AuthContext;
  invoiceId: string;
  data: {
    amount: number;
    method: PaymentMethod;
    status: PaymentStatus;
    reference?: string | null;
    failureReason?: string | null;
    receivedAt?: string | null;
  };
}

/**
 * Records a payment and re-derives the invoice status from every payment on
 * file, rather than trusting whatever the caller thinks the status should be.
 */
export async function recordPayment(input: RecordPaymentInput) {
  const { actor, invoiceId, data } = input;

  if (!can(actor, "finance.edit")) {
    return failure("FORBIDDEN", "You do not have permission to record payments.");
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    select: {
      id: true,
      invoiceNumber: true,
      amountDue: true,
      dueAt: true,
      status: true,
      client: { select: { id: true, companyName: true, assignedUserId: true } },
      payments: { select: { amount: true, status: true } },
    },
  });

  if (!invoice) {
    return failure("NOT_FOUND", "Invoice not found.");
  }

  if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.REFUNDED) {
    return failure(
      "ALREADY_SETTLED",
      `${invoice.invoiceNumber} is ${invoice.status.toLowerCase()} and cannot take further payments.`,
    );
  }

  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    return failure("INVALID", "A payment needs an amount greater than zero.");
  }

  if (data.status === PaymentStatus.FAILED && !data.failureReason?.trim()) {
    return failure("INVALID", "A failed payment needs a reason, so it can be chased.");
  }

  const existing = [
    ...invoice.payments.map((payment) => ({
      amount: Number(payment.amount),
      status: payment.status,
    })),
    { amount: data.amount, status: data.status },
  ];

  const settledAmount = existing
    .filter((payment) => payment.status === PaymentStatus.SUCCEEDED)
    .reduce((total, payment) => total + payment.amount, 0);

  const derived = deriveInvoiceStatus({
    amountDue: Number(invoice.amountDue),
    settledAmount,
    hasFailedPayment: existing.some((payment) => payment.status === PaymentStatus.FAILED),
    dueAt: invoice.dueAt,
  });

  const payment = await prisma.$transaction(async (transaction) => {
    const created = await transaction.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: data.amount,
        method: data.method,
        status: data.status,
        reference: data.reference || null,
        failureReason: data.failureReason || null,
        receivedAt:
          data.status === PaymentStatus.SUCCEEDED
            ? (data.receivedAt ? new Date(data.receivedAt) : new Date())
            : null,
        recordedById: actor.id,
      },
    });

    await transaction.invoice.update({
      where: { id: invoice.id },
      data: {
        status: derived.status,
        amountPaid: settledAmount,
        paidAt: derived.isSettled ? new Date() : null,
        failureReason: data.status === PaymentStatus.FAILED ? data.failureReason : null,
      },
    });

    return created;
  });

  await logActivity({
    actorId: actor.id,
    action: `Recorded a ${data.status.toLowerCase()} payment on ${invoice.invoiceNumber}`,
    entityType: "CONTRACT",
    entityId: invoice.client.id,
    fieldName: "invoiceStatus",
    previousValue: invoice.status,
    newValue: derived.status,
    metadataJson: { invoiceId: invoice.id, amount: data.amount },
  });

  // Delivery is gated on payment, so the account owner needs to know the
  // moment it lands - or the moment it fails.
  if (derived.isSettled || data.status === PaymentStatus.FAILED) {
    await createNotifications(
      resolveRecipients([invoice.client.assignedUserId], actor.id).map((recipientId) => ({
        recipientId,
        type: derived.isSettled ? ("APPROVAL_RECEIVED" as const) : ("PAYMENT_FAILED" as const),
        urgency: derived.isSettled ? ("NORMAL" as const) : ("HIGH" as const),
        title: derived.isSettled
          ? `Payment received for ${invoice.client.companyName}`
          : `Payment failed for ${invoice.client.companyName}`,
        body: derived.isSettled
          ? `${invoice.invoiceNumber} is paid in full. Production can begin.`
          : `${invoice.invoiceNumber} failed: ${data.failureReason}`,
        entityType: "CLIENT" as const,
        entityId: invoice.client.id,
        href: `/clients/${invoice.client.id}`,
      })),
    );
  }

  return { ok: true as const, payment, invoiceStatus: derived.status };
}
