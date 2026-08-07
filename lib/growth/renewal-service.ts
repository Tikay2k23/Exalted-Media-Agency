import { ExpansionStatus, ExpansionType, RenewalStage } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Renewals and expansion.
 *
 * The commercial end of the relationship. A renewal that nobody starts until
 * the contract has already lapsed is not a renewal conversation, it is a
 * recovery one, so the point of this module is to make the runway visible
 * early and to stop an outcome being recorded without the reasoning.
 */

export type RenewalFailureCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID";

export interface RenewalFailure {
  ok: false;
  code: RenewalFailureCode;
  message: string;
}

function failure(code: RenewalFailureCode, message: string): RenewalFailure {
  return { ok: false, code, message };
}

export const RENEWAL_FAILURE_STATUS: Record<RenewalFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
};

/**
 * The runway SOP 09 asks for, longest first.
 *
 * Derived from the date rather than stored. There is no scheduler in this
 * application, so nothing pushes these at you on the day - they surface on the
 * account and on the dashboards, which is the honest version of the same
 * thing. A stored "alert sent" flag with nothing to set it would be worse:
 * it would look like the reminder happened.
 */
export const RENEWAL_ALERT_DAYS = [90, 60, 45, 30, 14, 7] as const;

export interface RenewalRunway {
  daysUntil: number | null;
  /** The tightest threshold crossed, or null when there is still room. */
  window: number | null;
  overdue: boolean;
}

export function renewalRunway(renewalDate: Date | null, now = new Date()): RenewalRunway {
  if (!renewalDate) {
    return { daysUntil: null, window: null, overdue: false };
  }

  const daysUntil = Math.ceil(
    (renewalDate.getTime() - now.getTime()) / 86_400_000,
  );

  if (daysUntil < 0) {
    return { daysUntil, window: null, overdue: true };
  }

  // The tightest window the date has entered. At 20 days out that is 30, not
  // 90, because the closest deadline is the one worth showing.
  const window =
    [...RENEWAL_ALERT_DAYS].reverse().find((days) => daysUntil <= days) ?? null;

  return { daysUntil, window, overdue: false };
}

/** Stages where the renewal has been decided one way or the other. */
const SETTLED_STAGES: readonly RenewalStage[] = [
  RenewalStage.RENEWED,
  RenewalStage.DOWNGRADED,
  RenewalStage.DECLINED,
  RenewalStage.CHURNED,
];

export function isRenewalSettled(stage: RenewalStage) {
  return SETTLED_STAGES.includes(stage);
}

export const RENEWAL_STAGES = [
  { value: RenewalStage.NOT_STARTED, label: "Not started" },
  { value: RenewalStage.REVIEW_SCHEDULED, label: "Review scheduled" },
  { value: RenewalStage.PROPOSAL_PREPARED, label: "Proposal prepared" },
  { value: RenewalStage.PROPOSAL_SENT, label: "Proposal sent" },
  { value: RenewalStage.NEGOTIATING, label: "Negotiating" },
  { value: RenewalStage.RENEWED, label: "Renewed" },
  { value: RenewalStage.DOWNGRADED, label: "Renewed at a lower value" },
  { value: RenewalStage.DECLINED, label: "Declined" },
  { value: RenewalStage.CHURNED, label: "Churned" },
] as const;

export const EXPANSION_TYPES = [
  { value: ExpansionType.UPSELL, label: "Upsell" },
  { value: ExpansionType.CROSS_SELL, label: "Cross-sell" },
  { value: ExpansionType.ADDITIONAL_SERVICE, label: "Additional service" },
  { value: ExpansionType.INCREASED_SCOPE, label: "Increased scope" },
  { value: ExpansionType.REFERRAL_DRIVEN, label: "Referral driven" },
] as const;

export const EXPANSION_STATUSES = [
  { value: ExpansionStatus.IDENTIFIED, label: "Identified" },
  { value: ExpansionStatus.DISCUSSED, label: "Discussed with the client" },
  { value: ExpansionStatus.PROPOSED, label: "Proposed" },
  { value: ExpansionStatus.WON, label: "Won" },
  { value: ExpansionStatus.LOST, label: "Lost" },
  { value: ExpansionStatus.DEFERRED, label: "Deferred" },
] as const;

const DECIDED_EXPANSION: readonly ExpansionStatus[] = [
  ExpansionStatus.WON,
  ExpansionStatus.LOST,
];

export function isExpansionDecided(status: ExpansionStatus) {
  return DECIDED_EXPANSION.includes(status);
}

async function loadClient(actor: AuthContext, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: {
      id: true,
      companyName: true,
      assignedUserId: true,
      renewalDate: true,
      monthlyValue: true,
    },
  });
}

async function leadership() {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      teamRole: { in: ["AGENCY_OWNER", "PROJECT_MANAGER"] },
    },
    select: { id: true },
  });

  return users.map((user) => user.id);
}

export interface SaveRenewalInput {
  actor: AuthContext;
  clientId: string;
  stage: RenewalStage;
  renewalDate?: Date | null;
  contractEndDate?: Date | null;
  currentPackage?: string | null;
  recommendedPackage?: string | null;
  currentValue?: number | null;
  renewalValue?: number | null;
  meetingAt?: Date | null;
  decisionDate?: Date | null;
  clientInterest?: string | null;
  nextAction?: string | null;
  outcomeNote?: string | null;
  ownerId?: string | null;
}

/**
 * Creates or updates the renewal record. One per account.
 *
 * Settling a renewal - renewed, downgraded, declined, churned - requires a
 * note saying why. A churn with no reason recorded is the single most
 * expensive blank field in an agency: it is the one piece of information that
 * would stop the next one.
 */
export async function saveRenewal(input: SaveRenewalInput) {
  const { actor, clientId, stage } = input;

  if (!can(actor, "renewals.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage renewals.");
  }

  const outcomeNote = input.outcomeNote?.trim() || null;

  if (isRenewalSettled(stage) && !outcomeNote) {
    return failure(
      "INVALID",
      "Say why it ended this way. A renewal outcome with no reasoning is the one thing that would have helped next time.",
    );
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const existing = await prisma.renewal.findFirst({
    where: { clientId: client.id },
    select: { id: true, stage: true },
  });

  const data = {
    stage,
    renewalDate: input.renewalDate ?? client.renewalDate,
    contractEndDate: input.contractEndDate ?? null,
    currentPackage: input.currentPackage?.trim() || null,
    recommendedPackage: input.recommendedPackage?.trim() || null,
    currentValue: input.currentValue ?? null,
    renewalValue: input.renewalValue ?? null,
    meetingAt: input.meetingAt ?? null,
    decisionDate: input.decisionDate ?? null,
    clientInterest: input.clientInterest?.trim() || null,
    nextAction: input.nextAction?.trim() || null,
    outcomeNote,
    ownerId: input.ownerId?.trim() || client.assignedUserId,
  };

  const renewal = existing
    ? await prisma.renewal.update({ where: { id: existing.id }, data })
    : await prisma.renewal.create({ data: { ...data, clientId: client.id } });

  // The account's renewal date is what the dashboards and the stage gate read,
  // so it follows the renewal record rather than drifting from it.
  if (data.renewalDate && data.renewalDate !== client.renewalDate) {
    await prisma.client.update({
      where: { id: client.id },
      data: { renewalDate: data.renewalDate },
    });
  }

  await logActivity({
    actorId: actor.id,
    action: `Updated the renewal for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    ...(existing && existing.stage !== stage
      ? { fieldName: "renewalStage", previousValue: existing.stage, newValue: stage }
      : {}),
    metadataJson: { renewalId: renewal.id },
  });

  // Losing an account is leadership's business, immediately.
  if (
    (stage === RenewalStage.CHURNED || stage === RenewalStage.DECLINED)
    && existing?.stage !== stage
  ) {
    await createNotifications(
      resolveRecipients([...(await leadership()), client.assignedUserId], actor.id).map(
        (recipientId) => ({
          recipientId,
          type: "CLIENT_HEALTH_CHANGE" as const,
          urgency: "CRITICAL" as const,
          title: `${client.companyName} is not renewing`,
          body: outcomeNote ?? "",
          entityType: "CLIENT" as const,
          entityId: client.id,
          href: `/clients/${client.id}`,
        }),
      ),
    );
  }

  return { ok: true as const, renewal };
}

export async function saveExpansion(input: {
  actor: AuthContext;
  clientId: string;
  expansionId?: string | null;
  type: ExpansionType;
  status?: ExpansionStatus;
  title: string;
  description?: string | null;
  estimatedValue?: number | null;
  targetDate?: Date | null;
  outcomeNote?: string | null;
  ownerId?: string | null;
}) {
  const { actor, clientId } = input;

  if (!can(actor, "renewals.manage")) {
    return failure("FORBIDDEN", "You do not have permission to manage expansion.");
  }

  const title = input.title.trim();

  if (!title) {
    return failure("INVALID", "Say what the opportunity is.");
  }

  const status = input.status ?? ExpansionStatus.IDENTIFIED;
  const outcomeNote = input.outcomeNote?.trim() || null;

  if (isExpansionDecided(status) && !outcomeNote) {
    return failure(
      "INVALID",
      "Record why it was won or lost. That is the part worth reading next quarter.",
    );
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const data = {
    type: input.type,
    status,
    title,
    description: input.description?.trim() || null,
    estimatedValue: input.estimatedValue ?? null,
    targetDate: input.targetDate ?? null,
    outcomeNote,
    ownerId: input.ownerId?.trim() || client.assignedUserId,
    ...(isExpansionDecided(status) ? { decidedAt: new Date() } : {}),
  };

  if (input.expansionId) {
    const existing = await prisma.expansionOpportunity.findFirst({
      where: { id: input.expansionId, clientId: client.id },
      select: { id: true },
    });

    if (!existing) {
      return failure("NOT_FOUND", "Opportunity not found.");
    }

    const expansion = await prisma.expansionOpportunity.update({
      where: { id: existing.id },
      data,
    });

    await logActivity({
      actorId: actor.id,
      action: `Updated the expansion opportunity "${title}" for ${client.companyName}`,
      entityType: "CLIENT",
      entityId: client.id,
      metadataJson: { expansionId: expansion.id, status },
    });

    return { ok: true as const, expansion };
  }

  const expansion = await prisma.expansionOpportunity.create({
    data: { ...data, clientId: client.id },
  });

  await logActivity({
    actorId: actor.id,
    action: `Identified an expansion opportunity for ${client.companyName}: "${title}"`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { expansionId: expansion.id },
  });

  return { ok: true as const, expansion };
}
