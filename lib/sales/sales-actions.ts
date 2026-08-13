import type { LostReason, StrategyCallStatus } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
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
      contactId: true,
      proposalValue: true,
      budgetAmount: true,
      opportunityValue: true,
      tags: true,
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

/**
 * Custom tags.
 *
 * The automatic stage tag is not in here and cannot be. It is derived from the
 * stage every time it is displayed, so "remove the previous stage tag, apply
 * the new one" is true by construction rather than by a routine somebody has to
 * remember to call - and a stage move physically cannot disturb a source tag, a
 * campaign tag or anything else somebody typed, because it never touches this
 * column.
 */
export async function setTags(input: { actor: AuthContext; leadId: string; tags: string[] }) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to change.");
  }

  const seen = new Set<string>();

  for (const tag of input.tags) {
    const trimmed = tag.trim().slice(0, 40);
    // A hand-typed stage tag would be a second opinion about where the deal is.
    if (!trimmed || trimmed.toLowerCase().startsWith("stage_")) continue;
    seen.add(trimmed);
  }

  const tags = [...seen].slice(0, 20);

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: { tags },
    select: { id: true, tags: true },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Updated tags on ${lead.businessName}`,
    entityType: "LEAD",
    entityId: lead.id,
    fieldName: "tags",
    previousValue: lead.tags.join(", ") || null,
    newValue: tags.join(", ") || null,
  });

  return { ok: true as const, tags: updated.tags };
}

/**
 * Handing an opportunity to somebody else.
 *
 * Reassignment is a manager's move, not a rep's - a salesperson who could push
 * their own difficult deals onto a colleague has a pipeline nobody can hold
 * them to. Reps keep everything else they can do on their own leads.
 */
export async function setOwner(input: {
  actor: AuthContext;
  leadId: string;
  ownerId: string | null;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");

  if (!can(input.actor, "leads.view.all")) {
    return failure("FORBIDDEN", "Reassigning an opportunity is for whoever runs sales.");
  }

  if (input.ownerId) {
    const owner = await prisma.user.findFirst({
      where: { id: input.ownerId, isActive: true, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!owner) return failure("NOT_FOUND", "That person could not be found.");
  }

  if (input.ownerId === lead.assignedToId) {
    return { ok: true as const, ownerId: input.ownerId, unchanged: true };
  }

  const previous = lead.assignedToId
    ? await prisma.user.findUnique({
        where: { id: lead.assignedToId },
        select: { name: true },
      })
    : null;

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: { assignedToId: input.ownerId },
    select: { id: true, assignedToId: true, assignedTo: { select: { name: true } } },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Assigned ${lead.businessName} to ${updated.assignedTo?.name ?? "nobody"}`,
    entityType: "LEAD",
    entityId: lead.id,
    fieldName: "assignedToId",
    previousValue: previous?.name ?? null,
    newValue: updated.assignedTo?.name ?? null,
  });

  if (updated.assignedToId) {
    await createNotifications(
      resolveRecipients([updated.assignedToId], input.actor.id).map((recipientId) => ({
        recipientId,
        type: "TASK_ASSIGNED" as const,
        urgency: "HIGH" as const,
        title: `Opportunity assigned to you: ${lead.businessName}`,
        body: `${input.actor.name} moved this opportunity to you.`,
        entityType: "LEAD" as const,
        entityId: lead.id,
        href: `/leads?opportunity=${lead.id}`,
      })),
    );
  }

  return {
    ok: true as const,
    ownerId: updated.assignedToId,
    ownerName: updated.assignedTo?.name ?? null,
  };
}

/**
 * Who else is watching.
 *
 * Followers are not owners: they are told what happens and are answerable for
 * none of it. Sent as the whole list rather than add/remove calls, so the
 * result of a save is exactly what the drawer was showing.
 */
export async function setFollowers(input: {
  actor: AuthContext;
  leadId: string;
  userIds: string[];
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to change.");
  }

  const wanted = [...new Set(input.userIds)].slice(0, 20);

  const users = wanted.length
    ? await prisma.user.findMany({
        where: { id: { in: wanted }, isActive: true, deletedAt: null },
        select: { id: true, name: true },
      })
    : [];

  const valid = new Set(users.map((user) => user.id));
  const existing = await prisma.leadFollower.findMany({
    where: { leadId: lead.id },
    select: { userId: true },
  });

  const before = new Set(existing.map((row) => row.userId));
  const added = [...valid].filter((id) => !before.has(id));

  await prisma.$transaction([
    prisma.leadFollower.deleteMany({
      where: { leadId: lead.id, userId: { notIn: [...valid] } },
    }),
    prisma.leadFollower.createMany({
      data: added.map((userId) => ({ leadId: lead.id, userId, addedById: input.actor.id })),
      skipDuplicates: true,
    }),
  ]);

  await logActivity({
    actorId: input.actor.id,
    action: `Updated followers on ${lead.businessName}`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: { followers: users.map((user) => user.name) },
  });

  if (added.length) {
    await createNotifications(
      resolveRecipients(added, input.actor.id).map((recipientId) => ({
        recipientId,
        type: "TASK_ASSIGNED" as const,
        urgency: "NORMAL" as const,
        title: `Following: ${lead.businessName}`,
        body: `${input.actor.name} added you as a follower on this opportunity.`,
        entityType: "LEAD" as const,
        entityId: lead.id,
        href: `/leads?opportunity=${lead.id}`,
      })),
    );
  }

  return { ok: true as const, followers: users };
}

/**
 * The commercial detail: what the deal is called, what it is worth, when it
 * should land.
 *
 * Writes opportunityValue rather than budgetAmount. What the agency expects to
 * charge and what the prospect said they could spend are two different numbers,
 * and a forecast built from the second is a forecast of somebody's guess.
 */
export async function setOpportunityDetails(input: {
  actor: AuthContext;
  leadId: string;
  opportunityName?: string | null;
  opportunityValue?: number | null;
  expectedCloseAt?: string | null;
  serviceInterest?: string | null;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to change.");
  }

  const closeAt = input.expectedCloseAt ? new Date(input.expectedCloseAt) : null;

  if (closeAt && Number.isNaN(closeAt.getTime())) {
    return failure("INVALID", "That is not a date.");
  }

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      opportunityName:
        input.opportunityName === undefined
          ? undefined
          : input.opportunityName?.trim() || null,
      opportunityValue: input.opportunityValue === undefined ? undefined : input.opportunityValue,
      expectedCloseAt: input.expectedCloseAt === undefined ? undefined : closeAt,
      serviceInterest:
        input.serviceInterest === undefined
          ? undefined
          : ((input.serviceInterest || null) as never),
    },
    select: {
      id: true,
      opportunityName: true,
      opportunityValue: true,
      expectedCloseAt: true,
      serviceInterest: true,
    },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Updated the opportunity on ${lead.businessName}`,
    entityType: "LEAD",
    entityId: lead.id,
    ...(input.opportunityValue !== undefined
      ? {
          fieldName: "opportunityValue",
          previousValue: lead.opportunityValue === null ? null : String(lead.opportunityValue),
          newValue: input.opportunityValue === null ? null : String(input.opportunityValue),
        }
      : {}),
  });

  return {
    ok: true as const,
    opportunity: {
      ...updated,
      opportunityValue:
        updated.opportunityValue === null ? null : Number(updated.opportunityValue),
      expectedCloseAt: updated.expectedCloseAt?.toISOString() ?? null,
    },
  };
}

/**
 * A task against an open opportunity.
 *
 * Writes to EmployeeTask, the same table the delivery board, the workload
 * report, the EOD entries and the approval queue all read. A sales-only task
 * list would have been quicker to build and invisible to every one of them.
 *
 * A rep may give themselves work on their own deal; handing it to somebody else
 * needs the same permission as assigning work anywhere else in the agency.
 */
export async function addOpportunityTask(input: {
  actor: AuthContext;
  leadId: string;
  title: string;
  dueDate: string;
  assignedToId?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | null;
  note?: string | null;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to change.");
  }

  const title = input.title.trim();

  if (!title) return failure("INVALID", "A task needs a title.");

  const dueDate = new Date(input.dueDate);

  if (Number.isNaN(dueDate.getTime())) return failure("INVALID", "That is not a date.");

  const assignedToId = input.assignedToId || input.actor.id;

  if (assignedToId !== input.actor.id && !can(input.actor, "workItems.assign")) {
    return failure("FORBIDDEN", "Assigning work to somebody else is a manager's call.");
  }

  const assignee = await prisma.user.findFirst({
    where: { id: assignedToId, isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });

  if (!assignee) return failure("NOT_FOUND", "That team member could not be found.");

  const task = await prisma.employeeTask.create({
    data: {
      title,
      note: input.note?.trim() || null,
      leadId: lead.id,
      assignedToId: assignee.id,
      createdById: input.actor.id,
      dueDate,
      weekStartDate: dueDate,
      priority: input.priority ?? "MEDIUM",
      // Chasing a deal is outreach, which is the category the agency already
      // has for it. Adding a sales-only one would fragment the workload report.
      category: "LEAD_GENERATION_AND_OUTREACH",
    },
    select: { id: true, title: true, dueDate: true, status: true, priority: true },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Added a task on ${lead.businessName}: ${title}`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: { taskId: task.id, assignedTo: assignee.name },
  });

  await createNotifications(
    resolveRecipients([assignee.id], input.actor.id).map((recipientId) => ({
      recipientId,
      type: "TASK_ASSIGNED" as const,
      urgency: "NORMAL" as const,
      title: `New task: ${title}`,
      body: `${input.actor.name} added this against ${lead.businessName}.`,
      entityType: "LEAD" as const,
      entityId: lead.id,
      href: `/leads?opportunity=${lead.id}`,
    })),
  );

  return {
    ok: true as const,
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate.toISOString(),
      assigneeName: assignee.name,
    },
  };
}

/**
 * Moving a card between board columns.
 *
 * The one entry point the board uses, so every drop is subject to the same
 * rules a menu action would be. Dropping onto Won hands straight over to
 * markWon rather than setting the stage directly - that is where the existing
 * client is found and linked, and a stage write that skipped it would leave a
 * won deal with no account against it.
 *
 * The stage change is recorded on the activity trail with who moved it, what it
 * moved from, what it moved to, and when. That is the whole audit requirement:
 * the previous stage is only knowable at the moment of the move, so it is read
 * before the write rather than reconstructed afterwards.
 */
export async function moveLeadStage(input: {
  actor: AuthContext;
  leadId: string;
  stageKey: string;
}) {
  const lead = await loadLead(input.actor, input.leadId);

  if (!lead) return failure("NOT_FOUND", "That lead could not be found.");
  if (!mayEdit(input.actor, lead)) {
    return failure("FORBIDDEN", "That lead is not yours to move.");
  }

  // Winning is its own path, with the client lookup on it.
  if (input.stageKey === "won") {
    return markWon({ actor: input.actor, leadId: input.leadId });
  }

  if (lead.convertedClientId) {
    return failure("ALREADY_CLOSED", "This lead already became a client.");
  }

  const [target, current] = await Promise.all([
    prisma.pipelineStage.findFirst({
      where: { pipelineId: SALES_PIPELINE_ID, stageKey: input.stageKey },
      select: { id: true, name: true, stageKey: true },
    }),
    lead.stageId
      ? prisma.pipelineStage.findUnique({
          where: { id: lead.stageId },
          select: { id: true, name: true, stageKey: true },
        })
      : Promise.resolve(null),
  ]);

  if (!target) return failure("INVALID", "That is not a stage on the sales pipeline.");
  if (target.id === lead.stageId) {
    return { ok: true as const, lead, unchanged: true };
  }

  /*
   * Status follows the stage, because the two are read together everywhere
   * else. Leaving a lead in "NEW" while its stage says Negotiation is how the
   * metric strip and the board come to disagree.
   */
  const status =
    input.stageKey === "attempting_contact"
      ? "ATTEMPTING_CONTACT"
      : ["contacted", "strategy_call_booked", "strategy_call_showed"].includes(input.stageKey)
        ? "CONTACTED"
        : ["qualified", "proposal_sent", "negotiation"].includes(input.stageKey)
          ? "QUALIFIED"
          : input.stageKey === "long_term_nurture"
            ? "NURTURE"
            : "NEW";

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      stageId: target.id,
      status: status as never,
      // Moving into the proposal column starts the aging clock if nobody has
      // recorded a send date yet.
      ...(input.stageKey === "proposal_sent" ? { proposalSentAt: new Date() } : {}),
    },
    select: {
      id: true,
      stageId: true,
      status: true,
      stage: { select: { name: true, stageKey: true } },
    },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Moved ${lead.businessName} from ${current?.name ?? "no stage"} to ${target.name}`,
    entityType: "LEAD",
    entityId: lead.id,
    fieldName: "stageId",
    previousValue: current?.stageKey ?? null,
    newValue: target.stageKey,
    metadataJson: {
      fromStage: current?.name ?? null,
      toStage: target.name,
      movedById: input.actor.id,
      movedByName: input.actor.name,
      movedAt: new Date().toISOString(),
    },
  });

  return { ok: true as const, lead: updated };
}
