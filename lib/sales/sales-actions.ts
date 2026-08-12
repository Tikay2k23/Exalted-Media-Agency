import type { LostReason, StrategyCallStatus } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { SALES_PIPELINE_ID } from "@/lib/workspace-defaults";

import { leadVisibilityWhere } from "./lead-service";

/**
 * The moves a salesperson makes on a lead during a day.
 *
 * Each one records what happened rather than only where the lead ended up:
 * logging a call sets the contact date, marking a proposal sent sets the date
 * the clock runs from, and winning records who closed it. A pipeline that only
 * stores the current stage cannot answer any question about how it got there.
 */

export type SalesFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "REASON_REQUIRED"
  | "ALREADY_CLOSED";

export interface SalesFailure {
  ok: false;
  code: SalesFailureCode;
  message: string;
}

function failure(code: SalesFailureCode, message: string): SalesFailure {
  return { ok: false, code, message };
}

export const SALES_FAILURE_STATUS: Record<SalesFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  REASON_REQUIRED: 422,
  ALREADY_CLOSED: 409,
};

async function loadLead(actor: AuthContext, leadId: string) {
  const scope = leadVisibilityWhere(actor);

  if (!scope) return null;

  return prisma.lead.findFirst({
    where: { ...scope, id: leadId, deletedAt: null },
    select: {
      id: true,
      contactName: true,
      businessName: true,
      email: true,
      phone: true,
      status: true,
      stageId: true,
      assignedToId: true,
      convertedClientId: true,
      proposalValue: true,
      budgetAmount: true,
      stage: { select: { stageKey: true } },
    },
  });
}

/** Whether this person may change this lead. */
function mayEdit(actor: AuthContext, lead: { assignedToId: string | null }) {
  if (can(actor, "leads.edit")) return true;
  // A rep may work their own leads even without the blanket edit permission.
  return lead.assignedToId === actor.id;
}

/**
 * What happens next, and when.
 *
 * Both are optional individually but the pair is the point: setting a date with
 * no action leaves the next person guessing, and setting an action with no date
 * leaves it to memory.
 */
export async function setNextStep(input: {
  actor: AuthContext;
  leadId: string;
  nextAction?: string | null;
  nextFollowUpAt?: string | null;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to change.");
  }

  const at = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;

  if (at && Number.isNaN(at.getTime())) {
    return failure("INVALID", "That is not a date.");
  }

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      nextAction:
        typeof input.nextAction === "string"
          ? input.nextAction.trim() || null
          : undefined,
      nextFollowUpAt: input.nextFollowUpAt === undefined ? undefined : at,
    },
    select: { id: true, nextAction: true, nextFollowUpAt: true },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Set next step on ${lead.businessName}${
      updated.nextAction ? `: ${updated.nextAction}` : ""
    }`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: { nextFollowUpAt: updated.nextFollowUpAt?.toISOString() ?? null },
  });

  return { ok: true as const, lead: updated };
}

/**
 * Somebody reached this person.
 *
 * Stamps the contact date, which is what "never contacted" reads. Deliberately
 * not inferred from the stage: a lead can be dragged to Contacted without
 * anybody having picked up a phone, and that is exactly what this catches.
 */
export async function logContact(input: {
  actor: AuthContext;
  leadId: string;
  channel: "CALL" | "EMAIL" | "SMS" | "MEETING";
  note?: string | null;
  occurredAt?: string | null;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to change.");
  }

  const at = input.occurredAt ? new Date(input.occurredAt) : new Date();

  if (Number.isNaN(at.getTime())) return failure("INVALID", "That is not a date.");
  if (at > new Date()) {
    return failure("INVALID", "You cannot log contact that has not happened yet.");
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastContactAt: at },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Logged ${input.channel.toLowerCase()} with ${lead.contactName}`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: { channel: input.channel, note: input.note?.trim() || null },
  });

  return { ok: true as const, lastContactAt: at };
}

/** Booking the call, and later recording whether they turned up. */
export async function setStrategyCall(input: {
  actor: AuthContext;
  leadId: string;
  at?: string | null;
  status?: StrategyCallStatus | null;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to change.");
  }

  const at = input.at ? new Date(input.at) : null;

  if (at && Number.isNaN(at.getTime())) return failure("INVALID", "That is not a date.");

  /*
   * Showing up moves the stage, because it is the thing that actually advances
   * a deal - a booked call is a promise, a showed call is progress. Booking
   * moves it too, so the pipeline reflects reality without a second click.
   */
  const stageKey =
    input.status === "SHOWED"
      ? "strategy_call_showed"
      : input.status === "BOOKED" || (at && !input.status)
        ? "strategy_call_booked"
        : null;

  const stage = stageKey
    ? await prisma.pipelineStage.findFirst({
        where: { pipelineId: SALES_PIPELINE_ID, stageKey },
        select: { id: true },
      })
    : null;

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      strategyCallAt: input.at === undefined ? undefined : at,
      strategyCallStatus: input.status ?? undefined,
      ...(stage ? { stageId: stage.id } : {}),
      // Turning up is contact, whatever else was logged.
      ...(input.status === "SHOWED" ? { lastContactAt: new Date() } : {}),
    },
    select: { id: true, strategyCallAt: true, strategyCallStatus: true, stageId: true },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Strategy call ${input.status ? input.status.toLowerCase() : "scheduled"} for ${lead.businessName}`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: { at: at?.toISOString() ?? null, status: input.status ?? null },
  });

  return { ok: true as const, lead: updated };
}

/** Sending the proposal, which starts the aging clock. */
export async function recordProposalSent(input: {
  actor: AuthContext;
  leadId: string;
  value?: number | null;
  sentAt?: string | null;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to change.");
  }

  const sentAt = input.sentAt ? new Date(input.sentAt) : new Date();

  if (Number.isNaN(sentAt.getTime())) return failure("INVALID", "That is not a date.");

  const stage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: SALES_PIPELINE_ID, stageKey: "proposal_sent" },
    select: { id: true },
  });

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      proposalSentAt: sentAt,
      proposalValue: input.value ?? undefined,
      lastContactAt: sentAt,
      ...(stage ? { stageId: stage.id } : {}),
    },
    select: { id: true, proposalSentAt: true, proposalValue: true, stageId: true },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Proposal sent to ${lead.businessName}`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: { value: input.value ?? null },
  });

  return { ok: true as const, lead: updated };
}

/**
 * Losing it, with a reason.
 *
 * The reason is required and coded, because "lost" with no category is a row
 * nobody can learn anything from. The free-text note sits beside the code
 * rather than replacing it - the code is for counting, the note is for the
 * detail that never fits a category.
 */
export async function markLost(input: {
  actor: AuthContext;
  leadId: string;
  reason: LostReason;
  note?: string | null;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to change.");
  }

  if (lead.convertedClientId) {
    return failure("ALREADY_CLOSED", "This lead already became a client.");
  }

  if (!input.reason) {
    return failure("REASON_REQUIRED", "Say why it was lost, or nobody learns anything.");
  }

  const note = input.note?.trim() ?? "";

  if (input.reason === "OTHER" && !note) {
    return failure("REASON_REQUIRED", "Choose a reason, or describe it under Other.");
  }

  const stage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: SALES_PIPELINE_ID, stageKey: "lost" },
    select: { id: true },
  });

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: "LOST",
      lostAt: new Date(),
      lostReasonCode: input.reason,
      lostReason: note || undefined,
      // Nothing further is scheduled on a lost lead, or it keeps appearing in
      // somebody's follow-up list forever.
      nextFollowUpAt: null,
      nextAction: null,
      ...(stage ? { stageId: stage.id } : {}),
    },
    select: { id: true, status: true, lostAt: true, lostReasonCode: true },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Marked ${lead.businessName} lost: ${input.reason.replaceAll("_", " ").toLowerCase()}`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: { reason: input.reason, note: note || null },
  });

  return { ok: true as const, lead: updated };
}

/**
 * A client that looks like this lead, if one already exists.
 *
 * Matched on email first, then phone, then company name - in that order of
 * confidence. Creating a second client record for an account the agency
 * already has is the single worst thing a conversion can do: the delivery team
 * would work one record while the money lands against the other.
 */
export async function findMatchingClient(lead: {
  email: string | null;
  phone: string | null;
  businessName: string;
}) {
  const candidates = [
    lead.email ? { contactEmail: { equals: lead.email, mode: "insensitive" as const } } : null,
    lead.phone ? { contactPhone: lead.phone } : null,
    { companyName: { equals: lead.businessName, mode: "insensitive" as const } },
  ].filter(Boolean) as Record<string, unknown>[];

  for (const where of candidates) {
    const match = await prisma.client.findFirst({
      where: { ...where, deletedAt: null },
      select: { id: true, companyName: true, contactEmail: true },
    });

    if (match) return match;
  }

  return null;
}

/**
 * Winning it.
 *
 * Records who closed it, when, and for how much, then links the existing client
 * when the agency already has one. Conversion into a brand new client account
 * stays where it was, in convertLeadToClient - this is the lighter path for a
 * win against an account that already exists, and for recording the outcome
 * before the handoff paperwork is done.
 */
export async function markWon(input: {
  actor: AuthContext;
  leadId: string;
  finalValue?: number | null;
  clientId?: string | null;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");

  if (!can(input.actor, "leads.convert") && !mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to close.");
  }

  if (lead.convertedClientId) {
    return failure("ALREADY_CLOSED", "This lead has already been closed as won.");
  }

  // An explicit client wins over a guess; otherwise look for one that already
  // exists rather than leaving the link empty for somebody to create twice.
  let clientId = input.clientId ?? null;

  if (clientId) {
    const exists = await prisma.client.findFirst({
      where: { id: clientId, deletedAt: null },
      select: { id: true },
    });

    if (!exists) return failure("NOT_FOUND", "That client could not be found.");
  } else {
    const match = await findMatchingClient(lead);
    clientId = match?.id ?? null;
  }

  const stage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: SALES_PIPELINE_ID, stageKey: "won" },
    select: { id: true },
  });

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: "CONVERTED",
      wonAt: new Date(),
      wonById: input.actor.id,
      finalValue: input.finalValue ?? lead.proposalValue ?? lead.budgetAmount ?? undefined,
      nextFollowUpAt: null,
      nextAction: null,
      ...(clientId ? { convertedClientId: clientId } : {}),
      ...(stage ? { stageId: stage.id } : {}),
    },
    select: {
      id: true,
      status: true,
      wonAt: true,
      finalValue: true,
      convertedClientId: true,
    },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Won ${lead.businessName}`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: {
      finalValue: input.finalValue ?? null,
      linkedExistingClient: Boolean(clientId && !input.clientId),
      clientId,
    },
  });

  return {
    ok: true as const,
    lead: updated,
    // True when an account already existed and was linked rather than duplicated.
    linkedExisting: Boolean(clientId && !input.clientId),
  };
}

/** Parking a lead for later without pretending it is dead. */
export async function moveToNurture(input: {
  actor: AuthContext;
  leadId: string;
  until: string;
  reason?: string | null;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to change.");
  }

  const until = new Date(input.until);

  if (Number.isNaN(until.getTime())) return failure("INVALID", "That is not a date.");
  if (until <= new Date()) {
    return failure("INVALID", "Pick a date in the future, or it is not nurture.");
  }

  const stage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: SALES_PIPELINE_ID, stageKey: "long_term_nurture" },
    select: { id: true },
  });

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: "NURTURE",
      nurtureUntil: until,
      nextAction: input.reason?.trim() || undefined,
      // The nurture date replaces the follow-up, so they stop appearing in
      // today's list until the date they were parked to.
      nextFollowUpAt: null,
      ...(stage ? { stageId: stage.id } : {}),
    },
    select: { id: true, status: true, nurtureUntil: true },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Moved ${lead.businessName} to long-term nurture`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: { until: until.toISOString(), reason: input.reason?.trim() || null },
  });

  return { ok: true as const, lead: updated };
}
