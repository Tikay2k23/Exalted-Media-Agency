import type { ServiceType, TeamRole } from "@prisma/client";
import { addDays } from "date-fns";

import { logActivity } from "@/lib/activity";
import { getStageTaskTemplates, resolveAssignee } from "@/lib/automation/stage-automation";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { primaryOwnerRole } from "@/lib/workflow/handoff-engine";
import { rolesForService } from "@/lib/workflow/service-blueprints";
import { FULFILLMENT_PIPELINE_ID } from "@/lib/workspace-defaults";

/**
 * Creating a client, properly, in one action.
 *
 * The old create endpoint made a row and stopped. Whoever added the client then
 * had to work out which stage it belonged in, who owned it, which specialists
 * it needed, and what should happen first - which is most of the confusion this
 * rebuild exists to remove.
 *
 * Creating a client now also: puts it at the start of the journey, records who
 * holds it, creates the workstreams its service calls for, generates the
 * onboarding work, and tells the project manager it has arrived.
 */

export type CreateClientFailureCode = "FORBIDDEN" | "INVALID" | "DUPLICATE" | "NOT_FOUND";

export interface CreateClientFailure {
  ok: false;
  code: CreateClientFailureCode;
  message: string;
}

function failure(code: CreateClientFailureCode, message: string): CreateClientFailure {
  return { ok: false, code, message };
}

export const CREATE_CLIENT_FAILURE_STATUS: Record<CreateClientFailureCode, number> = {
  FORBIDDEN: 403,
  INVALID: 400,
  DUPLICATE: 409,
  NOT_FOUND: 404,
};

/**
 * Where a newly created client starts.
 *
 * Payment received rather than the sales stages: a client reaching this form
 * has already bought something. A prospect belongs in Leads, and conflating
 * the two is what made people create the same company twice.
 */
export const NEW_CLIENT_STAGE_KEY = "payment_received";

export interface CreateClientInput {
  actor: AuthContext;
  // Step 1 - who they are
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  website?: string | null;
  // Step 2 - what they bought
  serviceType: ServiceType;
  monthlyValue?: number | null;
  contractStartDate?: Date | null;
  contractEndDate?: Date | null;
  targetLaunchDate?: Date | null;
  // Step 3 - what they want
  mainGoal?: string | null;
  mainProblem?: string | null;
  targetAudience?: string | null;
  mainOffer?: string | null;
  // Step 4 and 5 - who does it
  projectManagerId?: string | null;
  specialistOwners?: Partial<Record<TeamRole, string | null>>;
  notes?: string | null;
}

export async function createClient(input: CreateClientInput) {
  const { actor } = input;

  if (!can(actor, "clients.create")) {
    return failure("FORBIDDEN", "You do not have permission to add clients.");
  }

  const companyName = input.companyName.trim();
  const contactName = input.contactName.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();

  if (!companyName || !contactName || !contactEmail) {
    return failure("INVALID", "A client needs a business name, a contact, and an email.");
  }

  // Catching the duplicate here rather than letting two records exist is the
  // whole point of asking "who adds the client" - the answer has to be "once".
  const existing = await prisma.client.findFirst({
    where: { companyName: { equals: companyName, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
  });

  if (existing) {
    return failure(
      "DUPLICATE",
      `${companyName} is already an account. Open it rather than creating a second one.`,
    );
  }

  const stage = await prisma.pipelineStage.findFirst({
    where: {
      stageKey: NEW_CLIENT_STAGE_KEY,
      pipelineId: FULFILLMENT_PIPELINE_ID,
      isDeprecated: false,
    },
    select: { id: true, name: true, stageKey: true },
  });

  if (!stage) {
    return failure("NOT_FOUND", "The client journey is not set up. Run the seed first.");
  }

  const projectManagerId = await resolveProjectManager(input.projectManagerId);
  const ownerRole = primaryOwnerRole(stage.stageKey, input.serviceType);

  const client = await prisma.$transaction(async (tx) => {
    const created = await tx.client.create({
      data: {
        companyName,
        clientName: contactName,
        contactEmail,
        contactPhone: input.contactPhone?.trim() || null,
        serviceType: input.serviceType,
        currentStageId: stage.id,
        stageEnteredAt: new Date(),
        assignedUserId: projectManagerId,
        currentOwnerRole: ownerRole,
        currentOwnerId: projectManagerId,
        monthlyValue: input.monthlyValue ?? null,
        contractStartDate: input.contractStartDate ?? null,
        contractEndDate: input.contractEndDate ?? null,
        notes: input.notes?.trim() || null,
        nextAction: "Send the welcome and the intake form",
        nextActionDueAt: addDays(new Date(), 1),
      },
    });

    // The primary contact is a real record, not just three fields on the
    // client: the approval register and several gates read it.
    await tx.clientContact.create({
      data: {
        clientId: created.id,
        name: contactName,
        email: contactEmail,
        phone: input.contactPhone?.trim() || null,
        isPrimary: true,
        isDecisionMaker: true,
      },
    });

    await tx.clientStageHistory.create({
      data: {
        clientId: created.id,
        toStageId: stage.id,
        changedById: actor.id,
        note: "Client created and placed at the start of the journey.",
      },
    });

    // Only the seats this service calls for.
    await tx.clientWorkstream.createMany({
      data: rolesForService(input.serviceType).map((role) => ({
        clientId: created.id,
        role,
        ownerId:
          role === "PROJECT_MANAGER"
            ? projectManagerId
            : input.specialistOwners?.[role] ?? null,
      })),
    });

    return created;
  });

  // The strategy answers collected in the wizard are the beginning of the
  // brief, so they go where the brief screen will look for them rather than
  // into a notes field somebody has to re-type later.
  if (input.mainGoal || input.mainProblem || input.targetAudience || input.mainOffer) {
    await prisma.strategyBrief.create({
      data: {
        clientId: client.id,
        authorId: actor.id,
        status: "DRAFT",
        primaryGoal: input.mainGoal?.trim() || null,
        targetAudience: input.targetAudience?.trim() || null,
        mainOffer: input.mainOffer?.trim() || null,
      },
    });
  }

  const generated = await generateOnboardingWork({
    clientId: client.id,
    // The constant rather than stage.stageKey: the stage was found by that key,
    // and the column is nullable in the schema for stages that predate keys.
    stageKey: NEW_CLIENT_STAGE_KEY,
    actorId: actor.id,
    accountOwnerId: projectManagerId,
    projectManagerId,
  });

  await logActivity({
    actorId: actor.id,
    action: `Created client ${companyName} and started onboarding`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: {
      service: input.serviceType,
      seats: rolesForService(input.serviceType),
      generatedTaskCount: generated,
    },
  });

  await createNotifications(
    resolveRecipients([projectManagerId], actor.id).map((recipientId) => ({
      recipientId,
      type: "TASK_ASSIGNED" as const,
      urgency: "HIGH" as const,
      title: `New client: ${companyName}`,
      body: "Onboarding has been created for you. Start with the welcome and intake form.",
      entityType: "CLIENT" as const,
      entityId: client.id,
      href: `/clients/${client.id}`,
    })),
  );

  return { ok: true as const, client, generatedTaskCount: generated };
}

/**
 * Picks the project manager.
 *
 * Falls back to the least-loaded person in the seat rather than nobody, so a
 * client is never created unowned. Somebody has to be looking at it on day one.
 */
async function resolveProjectManager(requested?: string | null) {
  const wanted = requested?.trim();

  if (wanted) {
    const chosen = await prisma.user.findFirst({
      where: { id: wanted, isActive: true, deletedAt: null },
      select: { id: true },
    });

    if (chosen) {
      return chosen.id;
    }
  }

  const candidates = await prisma.user.findMany({
    where: { teamRole: "PROJECT_MANAGER", isActive: true, deletedAt: null },
    select: {
      id: true,
      _count: { select: { assignedClients: { where: { deletedAt: null } } } },
    },
  });

  if (candidates.length === 0) {
    return null;
  }

  return candidates.sort((a, b) => a._count.assignedClients - b._count.assignedClients)[0].id;
}

/** Creates the onboarding work the first journey stage calls for. */
async function generateOnboardingWork(input: {
  clientId: string;
  stageKey: string;
  actorId: string;
  accountOwnerId: string | null;
  projectManagerId: string | null;
}) {
  const templates = getStageTaskTemplates(input.stageKey);

  if (templates.length === 0) {
    return 0;
  }

  const now = new Date();

  await prisma.employeeTask.createMany({
    data: templates.map((template) => {
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
          accountOwnerId: input.accountOwnerId,
          projectManagerId: input.projectManagerId,
          actorId: input.actorId,
        }),
        createdById: input.actorId,
        clientId: input.clientId,
        isClientFacing: template.isClientFacing ?? false,
        requiresQa: template.requiresQa ?? false,
        requiresApproval: template.requiresApproval ?? false,
        completionCriteria: template.completionCriteria ?? null,
      };
    }),
  });

  return templates.length;
}
