import { OffboardingReason, OffboardingStatus } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Offboarding.
 *
 * The end of the journey, and the part with the most ways to do lasting damage
 * quietly. SOP 09 is explicit that offboarding is not complete while ownership
 * is unclear, critical access remains, the data export is incomplete, billing
 * is unresolved, or client-owned assets have not been handled - so those are
 * conditions here, not a checklist somebody eyeballs.
 *
 * The ordering rule matters more than any of them: the client must be
 * confirmed as an administrator on their own platforms BEFORE agency access is
 * removed. Do it the other way round and there may be no administrator left at
 * all, which can lock a business out of its own advertising account, domain or
 * CRM permanently. That one is enforced rather than advised.
 */

export type OffboardingFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "OUT_OF_ORDER"
  | "INCOMPLETE";

export interface OffboardingFailure {
  ok: false;
  code: OffboardingFailureCode;
  message: string;
  outstanding?: string[];
}

function failure(
  code: OffboardingFailureCode,
  message: string,
  outstanding?: string[],
): OffboardingFailure {
  return { ok: false, code, message, outstanding };
}

export const OFFBOARDING_FAILURE_STATUS: Record<OffboardingFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  OUT_OF_ORDER: 409,
  INCOMPLETE: 409,
};

export const OFFBOARDING_REASONS = [
  { value: OffboardingReason.CONTRACT_ENDED, label: "Contract ended" },
  { value: OffboardingReason.CLIENT_CANCELLED, label: "Client cancelled" },
  { value: OffboardingReason.AGENCY_CANCELLED, label: "Agency ended it" },
  { value: OffboardingReason.PROJECT_COMPLETE, label: "Project complete" },
  { value: OffboardingReason.BUDGET, label: "Budget" },
  { value: OffboardingReason.PERFORMANCE, label: "Performance" },
  { value: OffboardingReason.RELATIONSHIP, label: "Relationship" },
  { value: OffboardingReason.BUSINESS_CLOSED, label: "Their business closed" },
  { value: OffboardingReason.OTHER, label: "Other" },
] as const;

/**
 * The steps that have to be done before an account can be closed, in the order
 * a person would actually do them.
 */
export const OFFBOARDING_STEPS = [
  {
    key: "finalBillingSettledAt",
    label: "Final billing settled",
    why: "Closing the account first removes the leverage to collect.",
  },
  {
    key: "remainingWorkCleared",
    label: "Remaining work finished or written off",
    why: "Open work items on a closed account never get done.",
  },
  {
    key: "assetsTransferredAt",
    label: "Client-owned assets handed over",
    why: "Their logo, copy and creative belong to them.",
  },
  {
    key: "dataExportedAt",
    label: "Data exported",
    why: "Contacts and history are theirs, and disappear when access does.",
  },
  {
    key: "clientAdminAccessConfirmedAt",
    label: "Client confirmed as administrator on their own platforms",
    why: "If nobody at the client is an administrator, removing agency access locks them out of their own accounts permanently.",
  },
  {
    key: "agencyAccessRemovedAt",
    label: "Agency access removed",
    why: "Leaving it in place is a live security hole on somebody else's business.",
  },
  {
    key: "finalReportSentAt",
    label: "Final report sent",
    why: "The last thing they remember is how it ended.",
  },
] as const;

export type OffboardingStepKey = (typeof OFFBOARDING_STEPS)[number]["key"];

export interface CompletableOffboarding {
  finalBillingSettledAt: Date | null;
  remainingWork: string | null;
  assetsTransferredAt: Date | null;
  dataExportedAt: Date | null;
  clientAdminAccessConfirmedAt: Date | null;
  agencyAccessRemovedAt: Date | null;
  finalReportSentAt: Date | null;
}

function isStepDone(record: CompletableOffboarding, key: OffboardingStepKey) {
  // Remaining work is a note rather than a timestamp: it is done when somebody
  // has written down what happened to it, including "nothing was outstanding".
  if (key === "remainingWorkCleared") {
    return Boolean(record.remainingWork?.trim());
  }

  return record[key] !== null;
}

/** Which steps are still outstanding, in order. */
export function outstandingOffboardingSteps(record: CompletableOffboarding) {
  return OFFBOARDING_STEPS.filter((step) => !isStepDone(record, step.key));
}

export function isOffboardingComplete(record: CompletableOffboarding) {
  return outstandingOffboardingSteps(record).length === 0;
}

/**
 * Whether agency access has been removed before the client was confirmed as an
 * administrator - the ordering mistake this module exists to prevent.
 */
export function hasLockoutRisk(record: CompletableOffboarding) {
  return (
    record.agencyAccessRemovedAt !== null && record.clientAdminAccessConfirmedAt === null
  );
}

async function loadClient(actor: AuthContext, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true, assignedUserId: true },
  });
}

export interface SaveOffboardingInput {
  actor: AuthContext;
  clientId: string;
  status?: OffboardingStatus;
  reason?: OffboardingReason;
  reasonDetail?: string | null;
  finalServiceDate?: Date | null;
  supportEndsAt?: Date | null;
  remainingWork?: string | null;
  lessonsLearned?: string | null;
  ownerId?: string | null;
  /** Steps being ticked in this save. */
  completeSteps?: OffboardingStepKey[];
  /** Steps being un-ticked, for correcting a mistake. */
  clearSteps?: OffboardingStepKey[];
}

/**
 * Creates or updates the offboarding record.
 *
 * Ticking "agency access removed" without the client being confirmed as an
 * administrator is refused outright. It is the one step here that cannot be
 * undone by the agency afterwards.
 */
export async function saveOffboarding(input: SaveOffboardingInput) {
  const { actor, clientId } = input;

  if (!can(actor, "offboarding.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage offboarding.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const existing = await prisma.offboardingRecord.findUnique({
    where: { clientId: client.id },
  });

  const complete = new Set(input.completeSteps ?? []);
  const clear = new Set(input.clearSteps ?? []);

  const now = new Date();
  const timestamps: Record<string, Date | null> = {};

  for (const step of OFFBOARDING_STEPS) {
    if (step.key === "remainingWorkCleared") {
      continue;
    }

    if (complete.has(step.key)) {
      timestamps[step.key] = existing?.[step.key] ?? now;
    } else if (clear.has(step.key)) {
      timestamps[step.key] = null;
    }
  }

  const merged: CompletableOffboarding = {
    finalBillingSettledAt:
      timestamps.finalBillingSettledAt !== undefined
        ? timestamps.finalBillingSettledAt
        : existing?.finalBillingSettledAt ?? null,
    remainingWork: input.remainingWork?.trim() ?? existing?.remainingWork ?? null,
    assetsTransferredAt:
      timestamps.assetsTransferredAt !== undefined
        ? timestamps.assetsTransferredAt
        : existing?.assetsTransferredAt ?? null,
    dataExportedAt:
      timestamps.dataExportedAt !== undefined
        ? timestamps.dataExportedAt
        : existing?.dataExportedAt ?? null,
    clientAdminAccessConfirmedAt:
      timestamps.clientAdminAccessConfirmedAt !== undefined
        ? timestamps.clientAdminAccessConfirmedAt
        : existing?.clientAdminAccessConfirmedAt ?? null,
    agencyAccessRemovedAt:
      timestamps.agencyAccessRemovedAt !== undefined
        ? timestamps.agencyAccessRemovedAt
        : existing?.agencyAccessRemovedAt ?? null,
    finalReportSentAt:
      timestamps.finalReportSentAt !== undefined
        ? timestamps.finalReportSentAt
        : existing?.finalReportSentAt ?? null,
  };

  // The rule worth having in code rather than in a document.
  if (hasLockoutRisk(merged)) {
    return failure(
      "OUT_OF_ORDER",
      "Confirm the client holds administrator access on their own platforms before recording that agency access was removed. The other order can leave their business locked out of its own accounts with nobody able to let them back in.",
    );
  }

  const status = input.status ?? existing?.status ?? OffboardingStatus.REQUESTED;

  if (status === OffboardingStatus.COMPLETE) {
    const outstanding = outstandingOffboardingSteps(merged);

    if (outstanding.length) {
      return failure(
        "INCOMPLETE",
        "Offboarding is not finished yet.",
        outstanding.map((step) => step.label),
      );
    }
  }

  const data = {
    status,
    reason: input.reason ?? existing?.reason ?? OffboardingReason.OTHER,
    reasonDetail: input.reasonDetail?.trim() ?? existing?.reasonDetail ?? null,
    finalServiceDate: input.finalServiceDate ?? existing?.finalServiceDate ?? null,
    supportEndsAt: input.supportEndsAt ?? existing?.supportEndsAt ?? null,
    lessonsLearned: input.lessonsLearned?.trim() ?? existing?.lessonsLearned ?? null,
    ownerId: input.ownerId?.trim() || existing?.ownerId || client.assignedUserId,
    remainingWork: merged.remainingWork,
    finalBillingSettledAt: merged.finalBillingSettledAt,
    assetsTransferredAt: merged.assetsTransferredAt,
    dataExportedAt: merged.dataExportedAt,
    clientAdminAccessConfirmedAt: merged.clientAdminAccessConfirmedAt,
    agencyAccessRemovedAt: merged.agencyAccessRemovedAt,
    finalReportSentAt: merged.finalReportSentAt,
    ...(status === OffboardingStatus.COMPLETE && !existing?.clientConfirmedAt
      ? { clientConfirmedAt: new Date() }
      : {}),
  };

  const record = existing
    ? await prisma.offboardingRecord.update({ where: { id: existing.id }, data })
    : await prisma.offboardingRecord.create({
        data: { ...data, clientId: client.id, cancellationRequestedAt: new Date() },
      });

  await logActivity({
    actorId: actor.id,
    action: existing
      ? `Updated offboarding for ${client.companyName}`
      : `Started offboarding for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    ...(existing && existing.status !== status
      ? { fieldName: "offboardingStatus", previousValue: existing.status, newValue: status }
      : {}),
    metadataJson: {
      offboardingId: record.id,
      completed: [...complete],
      cleared: [...clear],
    },
  });

  if (!existing) {
    const leadership = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        teamRole: { in: ["AGENCY_OWNER", "PROJECT_MANAGER"] },
      },
      select: { id: true },
    });

    await createNotifications(
      resolveRecipients(
        [...leadership.map((user) => user.id), client.assignedUserId],
        actor.id,
      ).map((recipientId) => ({
        recipientId,
        type: "CLIENT_HEALTH_CHANGE" as const,
        urgency: "CRITICAL" as const,
        title: `Offboarding started: ${client.companyName}`,
        body: input.reasonDetail?.trim() ?? "",
        entityType: "CLIENT" as const,
        entityId: client.id,
        href: `/clients/${client.id}`,
      })),
    );
  }

  return { ok: true as const, record };
}
