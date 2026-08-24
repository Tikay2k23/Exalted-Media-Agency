import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { guardClientWrite, serverFailure } from "@/lib/api/client-guard";
import { prisma } from "@/lib/prisma";
import { clientCommercialsSchema } from "@/lib/validators";

export const runtime = "nodejs";

function toDate(value: string | undefined) {
  if (!value) return null;

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function money(value: number | null) {
  return value === null ? "not set" : `$${value.toLocaleString("en-US")}`;
}

function day(value: Date | null) {
  return value
    ? value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "not set";
}

/**
 * The commercial terms, written across both records that hold them.
 *
 * The money and the dates belong to the client - the page header, the renewal
 * metrics and several stage gates read them from there. The agreement's own
 * shape belongs to the contract. One request writes both inside a transaction,
 * because a renewal date saved while the payment terms failed would leave the
 * account describing two different agreements.
 *
 * Finance permission, not merely clients.edit: this is what the account is
 * worth, and a specialist who may edit a client's address has no business
 * changing its monthly value.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const guard = await guardClientWrite(id, "finance.edit");

    if (!guard.ok) return guard.response;

    const parsed = clientCommercialsSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the terms and try again." },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const startDate = toDate(input.contractStartDate);
    const endDate = toDate(input.contractEndDate);
    const renewalDate = toDate(input.renewalDate);

    if (startDate && endDate && endDate < startDate) {
      return NextResponse.json(
        { error: "The contract cannot end before it starts." },
        { status: 400 },
      );
    }

    const before = await prisma.client.findUniqueOrThrow({
      where: { id: guard.client.id },
      select: {
        monthlyValue: true,
        contractStartDate: true,
        contractEndDate: true,
        renewalDate: true,
        contracts: {
          where: { deletedAt: null },
          orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
            agreementStatus: true,
            billingCadence: true,
            paymentTerms: true,
            autoRenew: true,
            documentUrl: true,
            recurringFee: true,
          },
        },
      },
    });

    const contract = before.contracts[0] ?? null;
    const changes: string[] = [];

    await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: guard.client.id },
        data: {
          monthlyValue: input.monthlyValue,
          contractStartDate: startDate,
          contractEndDate: endDate,
          renewalDate,
        },
      });

      if (contract) {
        await tx.contract.update({
          where: { id: contract.id },
          data: {
            agreementStatus: input.agreementStatus,
            billingCadence: input.billingCadence,
            paymentTerms: input.paymentTerms?.trim() || null,
            autoRenew: input.autoRenew,
            documentUrl: input.documentUrl?.trim() || null,
            // Keep the contract's own figure in step with the account's, so
            // the card never has to warn that the two disagree.
            recurringFee: input.monthlyValue,
            // Signing is a date, not just a state: a contract marked signed
            // with no signedAt reads as unsigned everywhere that checks.
            ...(input.agreementStatus === "SIGNED" && contract.agreementStatus !== "SIGNED"
              ? { signedAt: new Date() }
              : {}),
            startDate,
            endDate,
            renewalDate,
          },
        });
      }
    });

    const wasValue = before.monthlyValue === null ? null : Number(before.monthlyValue);

    if (wasValue !== input.monthlyValue) {
      changes.push(`monthly value ${money(wasValue)} → ${money(input.monthlyValue)}`);
    }
    if (before.renewalDate?.getTime() !== renewalDate?.getTime()) {
      changes.push(`renewal ${day(before.renewalDate)} → ${day(renewalDate)}`);
    }
    if (contract && contract.agreementStatus !== input.agreementStatus) {
      changes.push(`status ${contract.agreementStatus} → ${input.agreementStatus}`);
    }
    if (contract && contract.autoRenew !== input.autoRenew) {
      changes.push(`auto-renewal ${contract.autoRenew ? "on" : "off"} → ${input.autoRenew ? "on" : "off"}`);
    }

    if (changes.length > 0) {
      await logActivity({
        actorId: guard.actor.id,
        action: `Updated contract terms for ${guard.client.companyName}: ${changes.join(", ")}`,
        entityType: "CLIENT",
        entityId: guard.client.id,
        metadataJson: { changes },
      });
    }

    return NextResponse.json({
      ok: true,
      changed: changes.length,
      // Told plainly rather than silently ignored: an account with no contract
      // row still keeps its money and dates, but nothing holds the terms.
      contractRow: Boolean(contract),
    });
  } catch (error) {
    return serverFailure("api/clients/:id/commercials", error);
  }
}
