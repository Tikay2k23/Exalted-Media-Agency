import {
  type CallOutcome,
  type LeadSource,
  LeadStatus,
  type Prisma,
  type ServiceType,
} from "@prisma/client";
import { addDays } from "date-fns";

import { logActivity } from "@/lib/activity";
import {
  getStageTaskTemplates,
  resolveAssignee,
} from "@/lib/automation/stage-automation";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { findClientMatches, suggestedMatch } from "@/lib/sales/client-matching";
import {
  createLeadWithOpportunity,
  updateContactIdentity,
} from "@/lib/sales/contact-service";
import { scoreLead } from "@/lib/sales/lead-scoring";
import { FULFILLMENT_PIPELINE_ID, SALES_PIPELINE_ID } from "@/lib/workspace-defaults";

/**
 * Lead operations.
 *
 * Every function here enforces its own authorization rather than trusting the
 * caller, so a lead cannot leak through a route that forgot to check.
 */

export type LeadFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ALREADY_CONVERTED"
  | "INVALID"
  | "STAGE_NOT_FOUND";

export interface LeadFailure {
  ok: false;
  code: LeadFailureCode;
  message: string;
}

function failure(code: LeadFailureCode, message: string): LeadFailure {
  return { ok: false, code, message };
}

/**
 * How each failure reads over HTTP.
 *
 * Beside the codes rather than in a route, because four routes surface these
 * and a copy in each is four chances for the same failure to come back as a
 * different status depending on which door it went through.
 */
export const LEAD_FAILURE_STATUS: Record<LeadFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ALREADY_CONVERTED: 409,
  INVALID: 400,
  STAGE_NOT_FOUND: 400,
};

/**
 * Restricts a query to the leads this user may see.
 *
 * A sales representative holds `leads.view.assigned` only, so they see their
 * own leads and nothing else. Returning `null` means "no access at all".
 */
export function leadVisibilityWhere(actor: AuthContext): Prisma.LeadWhereInput | null {
  if (can(actor, "leads.view.all")) {
    return { deletedAt: null };
  }

  if (can(actor, "leads.view.assigned")) {
    return { deletedAt: null, assignedToId: actor.id };
  }

  return null;
}

/** Loads a lead only if this user is allowed to see it. */
async function loadVisibleLead(actor: AuthContext, leadId: string) {
  const visibility = leadVisibilityWhere(actor);

  if (!visibility) {
    return null;
  }

  return prisma.lead.findFirst({
    where: { AND: [{ id: leadId }, visibility] },
    include: {
      stage: { select: { id: true, name: true, stageKey: true } },
      assignedTo: { select: { id: true, name: true } },
      handoff: { select: { id: true, state: true } },
    },
  });
}

function toDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

/** Recomputes and stores the qualification score from the lead's own fields. */
function computeScore(lead: {
  budgetAmount: Prisma.Decimal | null;
  timeline: string | null;
  isDecisionMaker: boolean | null;
  mainProblem: string | null;
  goal: string | null;
  source: LeadSource;
  email: string | null;
  phone: string | null;
}) {
  return scoreLead({
    budgetAmount: decimalToNumber(lead.budgetAmount),
    timeline: lead.timeline,
    isDecisionMaker: lead.isDecisionMaker,
    mainProblem: lead.mainProblem,
    goal: lead.goal,
    source: lead.source,
    email: lead.email,
    phone: lead.phone,
  }).total;
}

export interface CreateLeadInput {
  actor: AuthContext;
  data: {
    contactName: string;
    businessName: string;
    email?: string | null;
    phone?: string | null;
    source: LeadSource;
    serviceInterest?: ServiceType | null;
    budgetAmount?: number | null;
    timeline?: string | null;
    isDecisionMaker?: boolean | null;
    mainProblem?: string | null;
    goal?: string | null;
    assignedToId?: string | null;
    stageId?: string | null;
    nextFollowUpAt?: string | null;
    notes?: string | null;
  };
}

/**
 * Creating a lead the long way round.
 *
 * Kept because callers and tests already speak this shape, but it no longer
 * writes anything itself - every lead is a contact plus an opportunity now, and
 * two functions that both create leads would eventually produce opportunities
 * with no contact behind them. This one forces a new contact, which is what it
 * always did; Add Lead goes through createLeadWithOpportunity directly so the
 * salesperson gets the duplicate warning.
 */
export async function createLead(input: CreateLeadInput) {
  const { actor, data } = input;

  const result = await createLeadWithOpportunity({
    actor,
    contact: {
      contactName: data.contactName,
      businessName: data.businessName,
      email: data.email,
      phone: data.phone,
    },
    opportunity: {
      source: data.source,
      serviceInterest: data.serviceInterest ?? null,
      budgetAmount: data.budgetAmount ?? null,
      timeline: data.timeline ?? null,
      isDecisionMaker: data.isDecisionMaker ?? null,
      mainProblem: data.mainProblem ?? null,
      goal: data.goal ?? null,
      assignedToId: data.assignedToId ?? null,
      stageId: data.stageId ?? null,
      nextFollowUpAt: data.nextFollowUpAt ?? null,
      notes: data.notes ?? null,
    },
    allowDuplicate: true,
  });

  if (!result.ok) {
    // The contact service has one code this one does not, and it cannot be
    // reached from here: allowDuplicate is always set.
    return failure(
      result.code === "DUPLICATE_CONTACT" ? "INVALID" : result.code,
      result.message,
    );
  }

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: result.leadId } });

  return { ok: true as const, lead };
}

export interface UpdateLeadInput {
  actor: AuthContext;
  leadId: string;
  data: Record<string, unknown> & {
    status?: LeadStatus;
    lostReason?: string | null;
    stageId?: string | null;
    assignedToId?: string | null;
  };
}

export async function updateLead(input: UpdateLeadInput) {
  const { actor, leadId, data } = input;

  if (!can(actor, "leads.edit")) {
    return failure("FORBIDDEN", "You do not have permission to edit leads.");
  }

  const existing = await loadVisibleLead(actor, leadId);

  if (!existing) {
    return failure("NOT_FOUND", "Lead not found.");
  }

  if (existing.status === LeadStatus.CONVERTED) {
    return failure(
      "ALREADY_CONVERTED",
      "This lead has already been converted into a client account and can no longer be edited.",
    );
  }

  // Closing a lead as lost without saying why destroys the only useful output
  // of losing it, so the reason is mandatory.
  if (data.status === LeadStatus.LOST && !String(data.lostReason ?? "").trim()) {
    return failure("INVALID", "A lost lead needs a recorded reason.");
  }

  if (data.stageId) {
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: String(data.stageId), pipelineId: SALES_PIPELINE_ID },
      select: { id: true },
    });

    if (!stage) {
      return failure("STAGE_NOT_FOUND", "That stage is not part of the sales pipeline.");
    }
  }

  const reassigning =
    data.assignedToId !== undefined && data.assignedToId !== existing.assignedToId;

  if (reassigning && !can(actor, "leads.view.all")) {
    return failure("FORBIDDEN", "You do not have permission to reassign leads.");
  }

  const merged = {
    budgetAmount:
      data.budgetAmount === undefined
        ? existing.budgetAmount
        : (data.budgetAmount as Prisma.Decimal | null),
    timeline: (data.timeline as string | undefined) ?? existing.timeline,
    isDecisionMaker:
      data.isDecisionMaker === undefined
        ? existing.isDecisionMaker
        : (data.isDecisionMaker as boolean | null),
    mainProblem: (data.mainProblem as string | undefined) ?? existing.mainProblem,
    goal: (data.goal as string | undefined) ?? existing.goal,
    source: (data.source as typeof existing.source) ?? existing.source,
    email: (data.email as string | undefined) ?? existing.email,
    phone: (data.phone as string | undefined) ?? existing.phone,
  };

  const updateData: Prisma.LeadUpdateInput = {
    score: computeScore(merged),
  };

  /*
   * Who the contact is belongs to the Contact record, and one writer keeps it
   * and every opportunity against it in step. Writing these four columns here
   * would rename the contact on one deal and leave their other deals showing
   * the old name until somebody noticed.
   */
  const identityTouched = ["contactName", "businessName", "email", "phone"].some(
    (field) => data[field] !== undefined,
  );

  if (identityTouched && existing.contactId) {
    const result = await updateContactIdentity({
      actor,
      contactId: existing.contactId,
      data: {
        ...(data.contactName !== undefined
          ? { name: String(data.contactName ?? "").trim() || existing.contactName }
          : {}),
        ...(data.businessName !== undefined
          ? { businessName: String(data.businessName ?? "").trim() || existing.businessName }
          : {}),
        ...(data.email !== undefined ? { email: (data.email as string) || null } : {}),
        ...(data.phone !== undefined ? { phone: (data.phone as string) || null } : {}),
      },
    });

    if (!result.ok) {
      return failure(result.code === "DUPLICATE_CONTACT" ? "INVALID" : result.code, result.message);
    }
  } else if (identityTouched) {
    // A lead with no contact behind it predates the split, or lost its contact
    // to a delete. Writing the columns directly is the only option, and it is
    // still correct because there is nothing else holding the same values.
    for (const field of ["contactName", "businessName"] as const) {
      const value = String(data[field] ?? "").trim();

      // These columns are NOT NULL, so an empty submission leaves them
      // unchanged rather than trying to blank a required field.
      if (data[field] !== undefined && value) updateData[field] = value;
    }

    if (data.phone !== undefined) updateData.phone = (data.phone as string) || null;
    if (data.email !== undefined) {
      updateData.email = String(data.email || "").toLowerCase() || null;
    }
  }

  for (const field of [
    "timeline",
    "mainProblem",
    "goal",
    "notes",
    "objection",
    "lostReason",
  ] as const) {
    if (data[field] !== undefined) {
      updateData[field] = (data[field] as string) || null;
    }
  }

  if (data.source !== undefined) {
    updateData.source = data.source as typeof existing.source;
  }
  if (data.serviceInterest !== undefined) {
    updateData.serviceInterest = data.serviceInterest as ServiceType | null;
  }
  if (data.budgetAmount !== undefined) {
    updateData.budgetAmount = data.budgetAmount as number | null;
  }
  if (data.proposalValue !== undefined) {
    updateData.proposalValue = data.proposalValue as number | null;
  }
  if (data.isDecisionMaker !== undefined) {
    updateData.isDecisionMaker = data.isDecisionMaker as boolean | null;
  }
  if (data.status !== undefined) {
    updateData.status = data.status;
  }
  for (const dateField of ["nextFollowUpAt", "proposalSentAt", "decisionDate"] as const) {
    if (data[dateField] !== undefined) {
      updateData[dateField] = toDate(data[dateField] as string);
    }
  }
  if (data.stageId !== undefined && data.stageId) {
    updateData.stage = { connect: { id: String(data.stageId) } };
  }
  if (reassigning) {
    updateData.assignedTo = data.assignedToId
      ? { connect: { id: String(data.assignedToId) } }
      : { disconnect: true };
  }

  const lead = await prisma.lead.update({ where: { id: leadId }, data: updateData });

  await logActivity({
    actorId: actor.id,
    action: `Updated lead ${lead.businessName}`,
    entityType: "LEAD",
    entityId: lead.id,
    ...(data.status !== undefined && data.status !== existing.status
      ? {
          fieldName: "status",
          previousValue: existing.status,
          newValue: lead.status,
        }
      : {}),
  });

  if (reassigning && lead.assignedToId) {
    await createNotifications(
      resolveRecipients([lead.assignedToId], actor.id).map((recipientId) => ({
        recipientId,
        type: "TASK_ASSIGNED" as const,
        urgency: "HIGH" as const,
        title: `Lead reassigned to you: ${lead.businessName}`,
        body: `${actor.name} assigned you this lead.`,
        entityType: "LEAD" as const,
        entityId: lead.id,
        href: `/leads/${lead.id}`,
      })),
    );
  }

  return { ok: true as const, lead };
}

export interface LogCallInput {
  actor: AuthContext;
  leadId: string;
  data: {
    outcome: CallOutcome;
    notes?: string | null;
    durationMinutes?: number | null;
    occurredAt?: string | null;
    nextFollowUpAt?: string | null;
  };
}

export async function logLeadCall(input: LogCallInput) {
  const { actor, leadId, data } = input;

  if (!can(actor, "leads.edit")) {
    return failure("FORBIDDEN", "You do not have permission to log calls.");
  }

  const lead = await loadVisibleLead(actor, leadId);

  if (!lead) {
    return failure("NOT_FOUND", "Lead not found.");
  }

  const call = await prisma.leadCallLog.create({
    data: {
      leadId: lead.id,
      loggedById: actor.id,
      outcome: data.outcome,
      notes: data.notes || null,
      durationMinutes: data.durationMinutes ?? null,
      occurredAt: toDate(data.occurredAt) ?? new Date(),
    },
  });

  // A logged call is contact, so a lead sitting in NEW has demonstrably moved on.
  const nextFollowUp = toDate(data.nextFollowUpAt);
  const shouldAdvance =
    lead.status === LeadStatus.NEW || lead.status === LeadStatus.ATTEMPTING_CONTACT;
  const connected =
    data.outcome === "CONNECTED"
    || data.outcome === "CALL_BOOKED"
    || data.outcome === "CALL_SHOWED";

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      ...(shouldAdvance
        ? {
            status: connected ? LeadStatus.CONTACTED : LeadStatus.ATTEMPTING_CONTACT,
          }
        : {}),
      ...(nextFollowUp ? { nextFollowUpAt: nextFollowUp } : {}),
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Logged a ${data.outcome.toLowerCase().replaceAll("_", " ")} call on ${lead.businessName}`,
    entityType: "LEAD",
    entityId: lead.id,
    metadataJson: { outcome: data.outcome },
  });

  return { ok: true as const, call };
}

export interface ConvertLeadInput {
  actor: AuthContext;
  leadId: string;
  data: {
    serviceType: ServiceType;
    assignedUserId?: string | null;
    monthlyValue?: number | null;
    notes?: string | null;
  };
}

/**
 * The sales-to-delivery handoff.
 *
 * Creates the client account, opens it at the first journey stage, generates
 * that stage's onboarding work so nothing depends on someone remembering it,
 * and closes the lead as Won. All of it lands in one transaction: a converted
 * lead with no client account, or a client with no onboarding work, would both
 * be silent process failures.
 */
export async function convertLeadToClient(input: ConvertLeadInput) {
  const { actor, leadId, data } = input;

  if (!can(actor, "leads.convert")) {
    return failure("FORBIDDEN", "You do not have permission to convert leads.");
  }

  const lead = await loadVisibleLead(actor, leadId);

  if (!lead) {
    return failure("NOT_FOUND", "Lead not found.");
  }

  if (lead.convertedClientId || lead.status === LeadStatus.CONVERTED) {
    return failure(
      "ALREADY_CONVERTED",
      "This lead has already been converted into a client account.",
    );
  }

  if (lead.handoff) {
    return failure(
      "ALREADY_CONVERTED",
      "This opportunity has already been closed as Won. Open it in Sales to see the handoff.",
    );
  }

  /*
   * The same duplicate guard the Won handoff applies.
   *
   * This endpoint predates that flow and is no longer reachable from the
   * interface, but it still creates client accounts, and an unguarded second
   * route into the same table is how the duplicate this check exists to
   * prevent eventually gets created anyway. Both paths now stop on a strong
   * match; only the Won dialog can carry a deliberate override.
   */
  const duplicates = await findClientMatches(lead);
  const strongDuplicate = suggestedMatch(duplicates);

  if (strongDuplicate) {
    return failure(
      "ALREADY_CONVERTED",
      `${strongDuplicate.companyName} already exists as a client (${strongDuplicate.reason.toLowerCase()}). Close this opportunity as Won instead, which can link to it.`,
    );
  }

  const [entryStage, wonStage] = await Promise.all([
    prisma.pipelineStage.findFirst({
      where: { pipelineId: FULFILLMENT_PIPELINE_ID, isDefault: true, isDeprecated: false },
      select: { id: true, name: true, stageKey: true },
    }),
    prisma.pipelineStage.findFirst({
      where: { pipelineId: SALES_PIPELINE_ID, stageKey: "won" },
      select: { id: true },
    }),
  ]);

  if (!entryStage) {
    return failure(
      "STAGE_NOT_FOUND",
      "The client journey has no entry stage configured. Run the workspace seed.",
    );
  }

  const accountOwnerId = data.assignedUserId || lead.assignedToId || actor.id;
  const now = new Date();

  const templates = getStageTaskTemplates(entryStage.stageKey);
  const generatedTasks = templates.map((template) => {
    const dueDate = addDays(now, template.dueInDays);

    return {
      title: template.title,
      note: template.note,
      category: template.category,
      priority: template.priority,
      estimatedHours: template.estimatedHours,
      dueDate,
      weekStartDate: dueDate,
      assignedToId: resolveAssignee(template.assignTo, {
        accountOwnerId,
        projectManagerId: null,
        actorId: actor.id,
      }),
      createdById: actor.id,
      isClientFacing: template.isClientFacing ?? false,
      requiresQa: template.requiresQa ?? false,
      requiresApproval: template.requiresApproval ?? false,
      completionCriteria: template.completionCriteria ?? null,
    };
  });

  const client = await prisma.$transaction(async (transaction) => {
    const created = await transaction.client.create({
      data: {
        clientName: lead.contactName,
        companyName: lead.businessName,
        contactEmail: lead.email ?? `${lead.id}@no-email.invalid`,
        contactPhone: lead.phone,
        serviceType: data.serviceType,
        currentStageId: entryStage.id,
        stageEnteredAt: now,
        assignedUserId: accountOwnerId,
        monthlyValue: data.monthlyValue ?? null,
        notes: data.notes || lead.notes,
      },
    });

    await transaction.clientStageHistory.create({
      data: {
        clientId: created.id,
        toStageId: entryStage.id,
        changedById: actor.id,
        changedAt: now,
        note: `Converted from lead ${lead.businessName}.`,
      },
    });

    if (generatedTasks.length) {
      await transaction.employeeTask.createMany({
        data: generatedTasks.map((task) => ({ ...task, clientId: created.id })),
      });
    }

    await transaction.lead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.CONVERTED,
        convertedClientId: created.id,
        decisionDate: now,
        /*
         * The win is recorded on the lead as well as the client. Once the
         * client record takes over, the lead is the only place that can still
         * answer "who closed this, when, and for how much" - and that is what
         * the sales reports are built on.
         */
        wonAt: now,
        wonById: actor.id,
        finalValue: data.monthlyValue ?? lead.proposalValue ?? lead.budgetAmount ?? null,
        // Nothing further is chased on a converted lead.
        nextFollowUpAt: null,
        nextAction: null,
        ...(wonStage ? { stageId: wonStage.id } : {}),
      },
    });

    return created;
  });

  await logActivity({
    actorId: actor.id,
    action: `Converted lead ${lead.businessName} into a client account`,
    entityType: "LEAD",
    entityId: lead.id,
    fieldName: "status",
    previousValue: lead.status,
    newValue: LeadStatus.CONVERTED,
    metadataJson: { clientId: client.id, generatedTaskCount: generatedTasks.length },
  });

  await logActivity({
    actorId: actor.id,
    action: `Created client ${client.companyName} from a converted lead`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { leadId: lead.id },
  });

  await createNotifications(
    resolveRecipients(
      [accountOwnerId, ...generatedTasks.map((task) => task.assignedToId)],
      actor.id,
    ).map((recipientId) => ({
      recipientId,
      type: "TASK_ASSIGNED" as const,
      urgency: "HIGH" as const,
      title: `New client account: ${client.companyName}`,
      body: `${actor.name} converted this lead. Onboarding work has been created for you.`,
      entityType: "CLIENT" as const,
      entityId: client.id,
      href: `/clients/${client.id}`,
    })),
  );

  return {
    ok: true as const,
    client,
    generatedTaskCount: generatedTasks.length,
  };
}
