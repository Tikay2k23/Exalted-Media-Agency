import {
  type AgreementStatus,
  HandoffPaymentStatus,
  HandoffState,
  LeadStatus,
  type Prisma,
  type ServiceType,
  type TeamRole,
} from "@prisma/client";
import { addDays } from "date-fns";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { getStageTaskTemplates, resolveAssignee } from "@/lib/automation/stage-automation";
import { nextInvoiceNumber } from "@/lib/finance/invoice-service";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { findClientMatches, suggestedMatch } from "@/lib/sales/client-matching";
import { primaryOwnerRole } from "@/lib/workflow/handoff-engine";
import { rolesForService, specialistsForService } from "@/lib/workflow/service-blueprints";
import { syncWorkstreams } from "@/lib/workflow/workstream-service";
import { FULFILLMENT_PIPELINE_ID, SALES_PIPELINE_ID } from "@/lib/workspace-defaults";

/**
 * Sales -> Won -> Client -> Journey.
 *
 * The handoff is a state machine rather than a single action, because the
 * steps between winning a deal and starting delivery are separated by real
 * events that happen at different times. A deal can be won on Monday and paid
 * on Friday, and the delivery team must not start on Monday: a client sitting
 * at "Payment Received" before the payment arrived is a record that lies, and
 * every stage gate downstream inherits the lie.
 *
 * LeadHandoff.leadId is unique, and that single constraint is what makes all
 * of this idempotent. A double-clicked Confirm, a refresh mid-flight, and a
 * retry after a failure all find the same row. Each step stamps its own
 * timestamp on completion, so a retry resumes at the step that failed rather
 * than repeating the ones that worked - which is the difference between a safe
 * retry and a second set of onboarding tasks.
 *
 * Nothing here deletes or rewrites sales history. The lead keeps its notes,
 * calls, proposals and follow-ups; the win is recorded on top of them.
 */

export type WonFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "ALREADY_WON"
  | "DUPLICATE_CLIENT"
  | "NOT_AWAITING_PAYMENT"
  | "STAGE_NOT_FOUND"
  | "HANDOFF_FAILED";

export const WON_FAILURE_STATUS: Record<WonFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  ALREADY_WON: 409,
  DUPLICATE_CLIENT: 409,
  NOT_AWAITING_PAYMENT: 409,
  STAGE_NOT_FOUND: 500,
  HANDOFF_FAILED: 500,
};

export interface WonFailure {
  ok: false;
  code: WonFailureCode;
  message: string;
  /** Present on DUPLICATE_CLIENT, so the dialog can offer the accounts found. */
  matches?: Awaited<ReturnType<typeof findClientMatches>>;
}

function failure(
  code: WonFailureCode,
  message: string,
  matches?: WonFailure["matches"],
): WonFailure {
  return { ok: false, code, message, ...(matches ? { matches } : {}) };
}

/* -------------------------------------------------------------------------- */
/* Permissions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Creating a second account despite a strong duplicate match.
 *
 * A sales representative may close deals and hand them over, but deciding that
 * two records with the same email are genuinely two different companies is an
 * account-management judgement with consequences for billing and delivery.
 *
 * `clients.create` is the right gate because anyone holding it can already
 * create the duplicate by hand through Add Client - refusing it here would only
 * send them the long way round. Delivery roles hold it; sales does not, which
 * is the separation that matters: the person closing the deal is not the person
 * who decides it is a new account.
 */
function mayOverrideDuplicate(actor: AuthContext) {
  return can(actor, "clients.create");
}

/**
 * Declaring that money arrived.
 *
 * Payment confirmation opens the delivery gates, so it sits with whoever
 * already owns the financial records rather than with whoever closed the deal.
 */
function mayConfirmPayment(actor: AuthContext) {
  return can(actor, "finance.edit");
}

/** Re-running a handoff that failed part way. */
function mayRetry(actor: AuthContext) {
  return can(actor, "clients.create") || can(actor, "finance.edit");
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

const leadSelect = {
  id: true,
  contactId: true,
  contactName: true,
  businessName: true,
  email: true,
  phone: true,
  source: true,
  serviceInterest: true,
  status: true,
  assignedToId: true,
  proposalValue: true,
  budgetAmount: true,
  notes: true,
  convertedClientId: true,
  handoff: { select: { id: true, state: true, clientId: true } },
} satisfies Prisma.LeadSelect;

async function loadLead(actor: AuthContext, leadId: string) {
  const seesEverything = can(actor, "leads.view.all");

  return prisma.lead.findFirst({
    where: {
      id: leadId,
      deletedAt: null,
      ...(seesEverything ? {} : { assignedToId: actor.id }),
    },
    select: leadSelect,
  });
}

/* -------------------------------------------------------------------------- */
/* Preview - what the confirmation dialog needs                               */
/* -------------------------------------------------------------------------- */

export interface WonPreview {
  leadId: string;
  businessName: string;
  contactName: string;
  suggestedServiceType: ServiceType | null;
  suggestedValue: number | null;
  matches: Awaited<ReturnType<typeof findClientMatches>>;
  suggestedClientId: string | null;
  projectManagers: { id: string; name: string; openClients: number }[];
  /** The seats this service calls for, so the dialog can say who picks it up. */
  specialists: TeamRole[];
  canOverrideDuplicate: boolean;
  canConfirmPayment: boolean;
  /** Set when this lead has already been through the dialog. */
  existingHandoff: { state: HandoffState; clientId: string | null } | null;
}

export async function getWonPreview(
  actor: AuthContext,
  leadId: string,
): Promise<WonPreview | WonFailure> {
  if (!can(actor, "leads.convert")) {
    return failure("FORBIDDEN", "You do not have permission to close opportunities.");
  }

  const lead = await loadLead(actor, leadId);

  if (!lead) return failure("NOT_FOUND", "That opportunity could not be found.");

  const service = lead.serviceInterest;

  const [matches, managers] = await Promise.all([
    findClientMatches(lead),
    prisma.user.findMany({
      where: { teamRole: "PROJECT_MANAGER", isActive: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        _count: { select: { assignedClients: { where: { deletedAt: null } } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    leadId: lead.id,
    businessName: lead.businessName,
    contactName: lead.contactName,
    suggestedServiceType: service,
    suggestedValue:
      lead.proposalValue?.toNumber() ?? lead.budgetAmount?.toNumber() ?? null,
    matches,
    suggestedClientId: suggestedMatch(matches)?.clientId ?? null,
    projectManagers: managers.map((manager) => ({
      id: manager.id,
      name: manager.name,
      openClients: manager._count.assignedClients,
    })),
    specialists: service ? specialistsForService(service) : [],
    canOverrideDuplicate: mayOverrideDuplicate(actor),
    canConfirmPayment: mayConfirmPayment(actor),
    existingHandoff: lead.handoff
      ? { state: lead.handoff.state, clientId: lead.handoff.clientId }
      : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Marking won                                                                */
/* -------------------------------------------------------------------------- */

export interface MarkWonData {
  serviceType: ServiceType;
  finalValue: number | null;
  contractStatus: AgreementStatus;
  paymentStatus: HandoffPaymentStatus;
  expectedStartDate: Date | null;
  handoffNote: string | null;
  projectManagerId: string | null;
  /** An account to link to, or null to create a new one. */
  linkClientId: string | null;
  /** A deliberate decision to create a new account despite a strong match. */
  overrideDuplicate: boolean;
}

export interface MarkWonResult {
  ok: true;
  handoffId: string;
  state: HandoffState;
  clientId: string | null;
  /** True when this call found an existing handoff instead of creating one. */
  alreadyProcessed: boolean;
  generatedTaskCount: number;
  linkedExistingClient: boolean;
}

export async function markLeadWon(input: {
  actor: AuthContext;
  leadId: string;
  data: MarkWonData;
}): Promise<MarkWonResult | WonFailure> {
  const { actor, leadId, data } = input;

  if (!can(actor, "leads.convert")) {
    return failure("FORBIDDEN", "You do not have permission to close opportunities.");
  }

  const lead = await loadLead(actor, leadId);

  if (!lead) return failure("NOT_FOUND", "That opportunity could not be found.");

  /*
   * The first idempotency check.
   *
   * A handoff row means this dialog has already been confirmed. Rather than
   * refusing, the existing state is returned: a double click and a refreshed
   * tab both land here, and both should see what happened rather than an
   * error about something they did not do wrong.
   */
  if (lead.handoff) {
    return {
      ok: true,
      handoffId: lead.handoff.id,
      state: lead.handoff.state,
      clientId: lead.handoff.clientId,
      alreadyProcessed: true,
      generatedTaskCount: 0,
      linkedExistingClient: Boolean(lead.handoff.clientId),
    };
  }

  if (lead.convertedClientId) {
    return failure("ALREADY_WON", "This opportunity has already been converted.");
  }

  // Re-checked on the server. The dialog shows matches, but the decision to
  // create a second account has to be authorised here, not trusted from a form.
  const matches = await findClientMatches(lead);
  const strong = suggestedMatch(matches);

  if (!data.linkClientId && strong && !data.overrideDuplicate) {
    return failure(
      "DUPLICATE_CLIENT",
      `${strong.companyName} already exists as a client (${strong.reason.toLowerCase()}). Link to it, or record a deliberate reason for creating a second account.`,
      matches,
    );
  }

  if (!data.linkClientId && strong && data.overrideDuplicate && !mayOverrideDuplicate(actor)) {
    return failure(
      "FORBIDDEN",
      "Creating a second account for a business that already exists needs a project manager or the agency owner.",
    );
  }

  if (data.linkClientId) {
    const exists = await prisma.client.findFirst({
      where: { id: data.linkClientId, deletedAt: null },
      select: { id: true },
    });

    if (!exists) return failure("NOT_FOUND", "That client account could not be found.");
  }

  const paid = data.paymentStatus === HandoffPaymentStatus.PAID;

  if (paid && !mayConfirmPayment(actor) && !can(actor, "leads.convert")) {
    return failure("FORBIDDEN", "You cannot confirm payment on this opportunity.");
  }

  const now = new Date();
  const wonStage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: SALES_PIPELINE_ID, stageKey: "won" },
    select: { id: true },
  });

  const handoff = await prisma.$transaction(async (tx) => {
    const created = await tx.leadHandoff.create({
      data: {
        leadId: lead.id,
        clientId: data.linkClientId,
        state: paid ? HandoffState.RUNNING : HandoffState.AWAITING_PAYMENT,
        serviceType: data.serviceType,
        finalValue: data.finalValue,
        contractStatus: data.contractStatus,
        paymentStatus: data.paymentStatus,
        expectedStartDate: data.expectedStartDate,
        handoffNote: data.handoffNote,
        projectManagerId: data.projectManagerId,
        paymentConfirmedAt: paid ? now : null,
        paymentConfirmedById: paid ? actor.id : null,
      },
    });

    /*
     * The sales outcome, recorded on the lead itself.
     *
     * `status` becomes CONVERTED only once an account actually exists, which
     * is why it is not set here for a pending payment: a lead marked converted
     * with nothing to point at would be wrong in every report that joins the
     * two. The Won stage is what puts the card in the Won column meanwhile,
     * and the handoff row is what says why it has not moved further.
     */
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        wonAt: now,
        wonById: actor.id,
        finalValue:
          data.finalValue ?? lead.proposalValue ?? lead.budgetAmount ?? undefined,
        decisionDate: now,
        // Nothing further is chased on a won deal.
        nextFollowUpAt: null,
        nextAction: null,
        ...(wonStage ? { stageId: wonStage.id } : {}),
      },
    });

    return created;
  });

  await logActivity({
    actorId: actor.id,
    action: `Marked ${lead.businessName} as Won`,
    entityType: "LEAD",
    entityId: lead.id,
    fieldName: "wonAt",
    previousValue: null,
    newValue: now.toISOString(),
    metadataJson: {
      finalValue: data.finalValue,
      service: data.serviceType,
      paymentStatus: data.paymentStatus,
      contractStatus: data.contractStatus,
      linkedClientId: data.linkClientId,
      overrodeDuplicate: data.overrideDuplicate,
    },
  });

  if (!paid) {
    await logActivity({
      actorId: actor.id,
      action: `${lead.businessName} is won and awaiting payment. Delivery has not started.`,
      entityType: "LEAD",
      entityId: lead.id,
      metadataJson: { handoffId: handoff.id, state: HandoffState.AWAITING_PAYMENT },
    });

    await notifyAwaitingPayment(actor, lead.businessName, lead.id, lead.assignedToId);

    return {
      ok: true,
      handoffId: handoff.id,
      state: HandoffState.AWAITING_PAYMENT,
      clientId: null,
      alreadyProcessed: false,
      generatedTaskCount: 0,
      linkedExistingClient: false,
    };
  }

  return runHandoff({ actor, handoffId: handoff.id });
}

/* -------------------------------------------------------------------------- */
/* Confirming payment later                                                   */
/* -------------------------------------------------------------------------- */

export async function confirmHandoffPayment(input: {
  actor: AuthContext;
  leadId: string;
}): Promise<MarkWonResult | WonFailure> {
  const { actor, leadId } = input;

  if (!mayConfirmPayment(actor)) {
    return failure("FORBIDDEN", "You do not have permission to confirm payment.");
  }

  const handoff = await prisma.leadHandoff.findUnique({
    where: { leadId },
    select: { id: true, state: true, clientId: true, lead: { select: { businessName: true } } },
  });

  if (!handoff) return failure("NOT_FOUND", "This opportunity has no handoff recorded.");

  if (handoff.state === HandoffState.COMPLETED) {
    return {
      ok: true,
      handoffId: handoff.id,
      state: handoff.state,
      clientId: handoff.clientId,
      alreadyProcessed: true,
      generatedTaskCount: 0,
      linkedExistingClient: Boolean(handoff.clientId),
    };
  }

  if (handoff.state === HandoffState.RUNNING) {
    return failure("NOT_AWAITING_PAYMENT", "This handoff is already being processed.");
  }

  const now = new Date();

  await prisma.leadHandoff.update({
    where: { id: handoff.id },
    data: {
      paymentStatus: HandoffPaymentStatus.PAID,
      paymentConfirmedAt: now,
      paymentConfirmedById: actor.id,
      state: HandoffState.RUNNING,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Payment confirmed for ${handoff.lead.businessName}. Starting the delivery handoff.`,
    entityType: "LEAD",
    entityId: leadId,
    fieldName: "paymentStatus",
    previousValue: HandoffPaymentStatus.PENDING,
    newValue: HandoffPaymentStatus.PAID,
  });

  return runHandoff({ actor, handoffId: handoff.id });
}

/* -------------------------------------------------------------------------- */
/* Retry                                                                      */
/* -------------------------------------------------------------------------- */

export async function retryHandoff(input: {
  actor: AuthContext;
  leadId: string;
}): Promise<MarkWonResult | WonFailure> {
  const { actor, leadId } = input;

  if (!mayRetry(actor)) {
    return failure("FORBIDDEN", "You do not have permission to retry a handoff.");
  }

  const handoff = await prisma.leadHandoff.findUnique({
    where: { leadId },
    select: { id: true, state: true, clientId: true, paymentStatus: true },
  });

  if (!handoff) return failure("NOT_FOUND", "This opportunity has no handoff recorded.");

  if (handoff.state === HandoffState.COMPLETED) {
    return {
      ok: true,
      handoffId: handoff.id,
      state: handoff.state,
      clientId: handoff.clientId,
      alreadyProcessed: true,
      generatedTaskCount: 0,
      linkedExistingClient: Boolean(handoff.clientId),
    };
  }

  if (handoff.paymentStatus !== HandoffPaymentStatus.PAID) {
    return failure(
      "NOT_AWAITING_PAYMENT",
      "This handoff is waiting for payment, not stuck. Confirm the payment to start it.",
    );
  }

  return runHandoff({ actor, handoffId: handoff.id });
}

/* -------------------------------------------------------------------------- */
/* The handoff itself                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Runs the handoff from wherever it got to.
 *
 * Every step checks its own timestamp before doing anything, so this is safe
 * to call repeatedly: the first call does the work, a retry after a failure
 * picks up at the failed step, and a call against a finished handoff does
 * nothing at all. A step that throws records which one it was and stops,
 * leaving the completed steps intact rather than rolling back work that
 * succeeded - a client that exists with no tasks is recoverable, a half-rolled
 * back conversion is not.
 */
async function runHandoff(input: {
  actor: AuthContext;
  handoffId: string;
}): Promise<MarkWonResult | WonFailure> {
  const { actor, handoffId } = input;

  const handoff = await prisma.leadHandoff.findUnique({
    where: { id: handoffId },
    include: {
      lead: {
        select: {
          id: true,
          businessName: true,
          contactName: true,
          email: true,
          phone: true,
          source: true,
          notes: true,
          assignedToId: true,
        },
      },
    },
  });

  if (!handoff) return failure("NOT_FOUND", "That handoff could not be found.");

  await prisma.leadHandoff.update({
    where: { id: handoffId },
    data: { attemptCount: { increment: 1 }, state: HandoffState.RUNNING },
  });

  let step = "client";
  let generatedTaskCount = 0;
  let linkedExisting = Boolean(handoff.clientLinkedAt && handoff.clientId);

  try {
    /*
     * Who is running delivery, settled once and used by every step below.
     *
     * This has to happen before the steps rather than inside the client step,
     * because onboarding ownership, task assignment and the notification list
     * all need it - and on a run where nobody picked a manager they would
     * otherwise read the null that was stored at confirmation time and fall
     * back to whoever clicked Confirm Won. The account would name the right
     * manager while their tasks sat in somebody else's My Work.
     */
    const projectManagerId = await resolveProjectManager(handoff.projectManagerId);

    if (projectManagerId !== handoff.projectManagerId) {
      await prisma.leadHandoff.update({
        where: { id: handoffId },
        data: { projectManagerId },
      });
    }

    /* -- Step 1: the client account ------------------------------------- */
    let clientId = handoff.clientId;
    let isNewClient = false;

    if (!handoff.clientLinkedAt) {
      if (clientId) {
        // Linking to an account that already exists. Its journey is left
        // exactly where it is: an upsell to a client in Ongoing Management
        // must not drag them back to Payment Received.
        linkedExisting = true;
        await syncWorkstreams({ clientId, service: handoff.serviceType });
      } else {
        clientId = await createClientFromHandoff(handoff, projectManagerId, actor);
        isNewClient = true;
      }

      await prisma.leadHandoff.update({
        where: { id: handoffId },
        data: { clientId, clientLinkedAt: new Date() },
      });

      await logActivity({
        actorId: actor.id,
        action: isNewClient
          ? `Created client ${handoff.lead.businessName} from the won opportunity`
          : `Linked the won opportunity to the existing client ${handoff.lead.businessName}`,
        entityType: "CLIENT",
        entityId: clientId,
        metadataJson: { leadId: handoff.leadId, handoffId, linkedExisting: !isNewClient },
      });
    }

    if (!clientId) {
      throw new Error("The handoff finished the client step without an account.");
    }

    /* -- Step 2: contract and invoice ----------------------------------- */
    step = "billing";

    if (!handoff.billingRecordedAt) {
      await recordBilling(handoff, clientId, actor);
      await prisma.leadHandoff.update({
        where: { id: handoffId },
        data: { billingRecordedAt: new Date() },
      });
    }

    /* -- Step 3: onboarding checkpoints --------------------------------- */
    step = "onboarding";

    if (!handoff.onboardingCreatedAt) {
      await openOnboardingRecord(handoff, clientId, projectManagerId);
      await prisma.leadHandoff.update({
        where: { id: handoffId },
        data: { onboardingCreatedAt: new Date() },
      });
    }

    /* -- Step 4: onboarding tasks --------------------------------------- */
    step = "tasks";

    if (!handoff.tasksCreatedAt) {
      generatedTaskCount = await createOnboardingTasks(
        handoff,
        clientId,
        actor,
        projectManagerId,
      );
      await prisma.leadHandoff.update({
        where: { id: handoffId },
        data: { tasksCreatedAt: new Date() },
      });
    }

    /* -- Step 5: tell the people who have to act ------------------------ */
    step = "notifications";

    if (!handoff.notifiedAt) {
      await notifyHandoffComplete(handoff, clientId, actor, projectManagerId);
      await prisma.leadHandoff.update({
        where: { id: handoffId },
        data: { notifiedAt: new Date() },
      });
    }

    /* -- Done ----------------------------------------------------------- */
    step = "complete";

    /*
     * Client.sourceLead is a one-to-one: it means "the deal this account
     * originated from", and only the first one can be that. A second deal
     * against the same account is an upsell, and claiming the slot for it
     * would both violate the unique key and overwrite where the account
     * actually came from.
     *
     * So the link is only claimed when it is free. Every deal - first or
     * fifth - is joined to its account through LeadHandoff.clientId, which is
     * the relationship that is genuinely many-to-one.
     */
    const originatingLead = await prisma.lead.findFirst({
      where: { convertedClientId: clientId },
      select: { id: true },
    });

    const claimsOrigin = !originatingLead || originatingLead.id === handoff.leadId;

    await prisma.$transaction([
      prisma.leadHandoff.update({
        where: { id: handoffId },
        data: {
          state: HandoffState.COMPLETED,
          completedAt: new Date(),
          failedStep: null,
          failureMessage: null,
        },
      }),
      prisma.lead.update({
        where: { id: handoff.leadId },
        data: {
          status: LeadStatus.CONVERTED,
          ...(claimsOrigin ? { convertedClientId: clientId } : {}),
        },
      }),
    ]);

    await logActivity({
      actorId: actor.id,
      action: `Handoff completed for ${handoff.lead.businessName}. Delivery has started.`,
      entityType: "CLIENT",
      entityId: clientId,
      metadataJson: { leadId: handoff.leadId, handoffId, generatedTaskCount },
    });

    return {
      ok: true,
      handoffId,
      state: HandoffState.COMPLETED,
      clientId,
      alreadyProcessed: false,
      generatedTaskCount,
      linkedExistingClient: linkedExisting,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";

    console.error(`[won-service] Handoff ${handoffId} failed at step "${step}".`, error);

    await prisma.leadHandoff.update({
      where: { id: handoffId },
      data: { state: HandoffState.FAILED, failedStep: step, failureMessage: message },
    });

    await logActivity({
      actorId: actor.id,
      action: `Handoff for ${handoff.lead.businessName} failed at the ${step} step`,
      entityType: "LEAD",
      entityId: handoff.leadId,
      metadataJson: { handoffId, failedStep: step, message },
    });

    return failure(
      "HANDOFF_FAILED",
      `The handoff stopped at the ${step} step: ${message}. The steps that completed are kept, and an authorised user can retry.`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

type LoadedHandoff = Prisma.LeadHandoffGetPayload<{
  include: {
    lead: {
      select: {
        id: true;
        businessName: true;
        contactName: true;
        email: true;
        phone: true;
        source: true;
        notes: true;
        assignedToId: true;
      };
    };
  };
}>;

/**
 * The new client account, opened at the first journey stage.
 *
 * "Payment Received" rather than anything earlier, and only ever reached from
 * a paid handoff - which is what makes the stage name true. The journey itself
 * is the existing one: a currentStageId on the fulfilment pipeline plus the
 * first history row, exactly as every other route into the journey creates it.
 */
async function createClientFromHandoff(
  handoff: LoadedHandoff,
  projectManagerId: string | null,
  actor: AuthContext,
) {
  const stage = await prisma.pipelineStage.findFirst({
    where: {
      pipelineId: FULFILLMENT_PIPELINE_ID,
      stageKey: "payment_received",
      isDeprecated: false,
    },
    select: { id: true, stageKey: true },
  });

  if (!stage) {
    throw new Error(
      "The client journey has no Payment Received stage. Run the workspace seed.",
    );
  }

  const { lead } = handoff;
  const ownerRole = primaryOwnerRole(stage.stageKey, handoff.serviceType);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        companyName: lead.businessName,
        clientName: lead.contactName,
        // The lead's own address, or a placeholder that is obviously one. An
        // invented address would be worse: somebody would eventually email it.
        contactEmail: lead.email ?? `${lead.id}@no-email.invalid`,
        contactPhone: lead.phone,
        serviceType: handoff.serviceType,
        currentStageId: stage.id,
        stageEnteredAt: now,
        assignedUserId: projectManagerId,
        currentOwnerRole: ownerRole,
        currentOwnerId: projectManagerId,
        monthlyValue: handoff.finalValue,
        contractStartDate: handoff.expectedStartDate,
        // Everything sales knows, carried across rather than retyped.
        notes: [
          lead.notes?.trim(),
          handoff.handoffNote?.trim()
            ? `Sales handoff note: ${handoff.handoffNote.trim()}`
            : null,
          `Original lead source: ${lead.source}.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        nextAction: "Send the welcome and the intake form",
        nextActionDueAt: addDays(now, 1),
      },
    });

    // A real contact record, not just three columns on the client: the
    // approval register and several stage gates read this table.
    await tx.clientContact.create({
      data: {
        clientId: client.id,
        name: lead.contactName,
        email: lead.email ?? `${lead.id}@no-email.invalid`,
        phone: lead.phone,
        isPrimary: true,
        isDecisionMaker: true,
      },
    });

    await tx.clientStageHistory.create({
      data: {
        clientId: client.id,
        toStageId: stage.id,
        changedById: actor.id,
        changedAt: now,
        note: `Converted from the won opportunity ${lead.businessName}.`,
      },
    });

    // Only the seats this service calls for.
    await tx.clientWorkstream.createMany({
      data: rolesForService(handoff.serviceType).map((role) => ({
        clientId: client.id,
        role,
        ownerId:
          role === "PROJECT_MANAGER"
            ? projectManagerId
            : role === "SALES_REP"
              ? lead.assignedToId
              : null,
        isRequired: true,
      })),
    });

    return client.id;
  });
}

/**
 * The money, in the commercial records rather than a field of its own.
 *
 * A Contract and a paid Invoice are what the `contract_recorded` and
 * `payment_confirmed` stage gates already read. Writing them here means the
 * gates downstream pass because the money genuinely is recorded, not because
 * the handoff asserted it.
 */
async function recordBilling(
  handoff: LoadedHandoff,
  clientId: string,
  actor: AuthContext,
) {
  const value = handoff.finalValue;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        clientId,
        title: `${handoff.lead.businessName} - ${handoff.serviceType}`,
        agreementStatus: handoff.contractStatus,
        signedAt: handoff.contractStatus === "SIGNED" ? now : null,
        contractValue: value,
        recurringFee: value,
        startDate: handoff.expectedStartDate,
        createdById: actor.id,
        notes: handoff.handoffNote,
      },
    });

    if (value === null) {
      // No figure was agreed, so there is nothing to invoice. The contract
      // still exists; inventing an amount to satisfy a gate would be worse
      // than the gate staying shut until somebody records the real number.
      return;
    }

    await tx.invoice.create({
      data: {
        clientId,
        contractId: contract.id,
        /*
         * The finance module's own allocator, not a number of this module's
         * invention. It derives the next value by sorting existing numbers as
         * text and parsing the highest, so anything not in INV-000000 shape
         * sorts above the real ones and resets the sequence to 1. Sharing the
         * function is what stops the two writers from disagreeing, and it runs
         * inside this transaction so two concurrent handoffs cannot collide.
         */
        invoiceNumber: await nextInvoiceNumber(tx),
        status: "PAID",
        amountDue: value,
        amountPaid: value,
        issuedAt: now,
        paidAt: handoff.paymentConfirmedAt ?? now,
        notes: "Raised automatically on the sales handoff.",
      },
    });
  });
}

/**
 * The onboarding checkpoints.
 *
 * OnboardingRecord already exists and is keyed one-to-one to the client, so
 * this opens that record rather than adding a second checklist. Upsert rather
 * than create: a linked account being sold a second service already has one.
 */
async function openOnboardingRecord(
  handoff: LoadedHandoff,
  clientId: string,
  projectManagerId: string | null,
) {
  await prisma.onboardingRecord.upsert({
    where: { clientId },
    create: {
      clientId,
      status: "NOT_STARTED",
      ownerId: projectManagerId,
      targetLaunchDate: handoff.expectedStartDate,
      notes: handoff.handoffNote,
    },
    update: {
      ownerId: projectManagerId ?? undefined,
      targetLaunchDate: handoff.expectedStartDate ?? undefined,
    },
  });
}

/**
 * The onboarding work, from the existing stage templates.
 *
 * getStageTaskTemplates("payment_received") is the same catalogue the journey
 * uses when an account is moved into that stage by hand, so the work generated
 * by a conversion and the work generated by a stage move cannot diverge.
 * Assignment runs through resolveAssignee with the real workstream owners, so
 * a specialist task lands on the specialist when the seat is staffed and on
 * the project manager when it is not.
 */
async function createOnboardingTasks(
  handoff: LoadedHandoff,
  clientId: string,
  actor: AuthContext,
  projectManagerId: string | null,
) {
  const templates = getStageTaskTemplates("payment_received");

  if (templates.length === 0) return 0;

  const workstreams = await prisma.clientWorkstream.findMany({
    where: { clientId },
    select: { role: true, ownerId: true },
  });

  const workstreamOwners = Object.fromEntries(
    workstreams.map((stream) => [stream.role, stream.ownerId]),
  ) as Partial<Record<TeamRole, string | null>>;

  const now = new Date();

  await prisma.employeeTask.createMany({
    data: templates.map((template) => {
      const dueDate = addDays(handoff.expectedStartDate ?? now, template.dueInDays);

      return {
        title: template.title,
        note: template.note,
        category: template.category,
        priority: template.priority,
        estimatedHours: template.estimatedHours,
        dueDate,
        weekStartDate: dueDate,
        assignedToId: resolveAssignee(template.assignTo, {
          accountOwnerId: projectManagerId,
          projectManagerId,
          actorId: actor.id,
          workstreamOwners,
        }),
        createdById: actor.id,
        clientId,
        // The opportunity stays attached, so the delivery work can be traced
        // back to the deal that paid for it.
        leadId: handoff.leadId,
        isClientFacing: template.isClientFacing ?? false,
        requiresQa: template.requiresQa ?? false,
        requiresApproval: template.requiresApproval ?? false,
        completionCriteria: template.completionCriteria ?? null,
      };
    }),
  });

  return templates.length;
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

/** Only the people who have something to do about it. */
async function notifyHandoffComplete(
  handoff: LoadedHandoff,
  clientId: string,
  actor: AuthContext,
  projectManagerId: string | null,
) {
  const tasks = await prisma.employeeTask.findMany({
    where: { clientId, leadId: handoff.leadId, deletedAt: null },
    select: { assignedToId: true },
  });

  const recipients = resolveRecipients(
    [projectManagerId, ...tasks.map((task) => task.assignedToId)],
    actor.id,
  );

  await createNotifications(
    recipients.map((recipientId) => ({
      recipientId,
      type: "TASK_ASSIGNED" as const,
      urgency: "HIGH" as const,
      title: `New client assigned: ${handoff.lead.businessName}`,
      body: "Payment is confirmed and onboarding has started. Your onboarding tasks are in My Work.",
      entityType: "CLIENT" as const,
      entityId: clientId,
      href: `/clients/${clientId}`,
    })),
  );
}

/**
 * The won-but-unpaid notice.
 *
 * Goes to whoever can confirm the payment, not to the delivery team: there is
 * nothing for delivery to do yet, and telling them there is would be the
 * beginning of somebody starting early.
 */
async function notifyAwaitingPayment(
  actor: AuthContext,
  businessName: string,
  leadId: string,
  salesOwnerId: string | null,
) {
  const financeUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      teamRole: { in: ["AGENCY_OWNER", "PROJECT_MANAGER"] },
    },
    select: { id: true },
  });

  const recipients = resolveRecipients(
    [salesOwnerId, ...financeUsers.map((user) => user.id)],
    actor.id,
  );

  await createNotifications(
    recipients.map((recipientId) => ({
      recipientId,
      type: "MISSING_PAYMENT" as const,
      urgency: "NORMAL" as const,
      title: `Won, awaiting payment: ${businessName}`,
      body: "Delivery has not started. Confirm the payment to begin onboarding.",
      entityType: "LEAD" as const,
      entityId: leadId,
      href: `/leads?lead=${leadId}`,
    })),
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Picks the project manager.
 *
 * Falls back to the least-loaded person in the seat rather than nobody: a
 * client created with no owner is one nobody is looking at on day one, and
 * that is exactly the account that goes quiet.
 */
async function resolveProjectManager(requested: string | null) {
  if (requested) {
    const chosen = await prisma.user.findFirst({
      where: { id: requested, isActive: true, deletedAt: null },
      select: { id: true },
    });

    if (chosen) return chosen.id;
  }

  const candidates = await prisma.user.findMany({
    where: { teamRole: "PROJECT_MANAGER", isActive: true, deletedAt: null },
    select: {
      id: true,
      _count: { select: { assignedClients: { where: { deletedAt: null } } } },
    },
  });

  if (candidates.length === 0) return null;

  return candidates.sort(
    (a, b) => a._count.assignedClients - b._count.assignedClients,
  )[0].id;
}
