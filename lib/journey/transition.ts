import { addDays } from "date-fns";

import { logActivity } from "@/lib/activity";
import {
  recordHandoff,
  syncWorkstreams,
  workstreamOwners,
} from "@/lib/workflow/workstream-service";
import {
  getServiceTaskTemplates,
  getStageTaskTemplates,
  templateKeyFor,
  resolveAssignee,
} from "@/lib/automation/stage-automation";
import { type AuthContext } from "@/lib/authz";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import {
  type RequirementEvaluation,
  evaluateStageRequirements,
} from "@/lib/journey/stage-requirements";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Moving an account between journey stages.
 *
 * This is the single place a stage change may happen. It enforces the stage
 * gate, records an auditable override when one is used, generates the work the
 * SOP requires next, and notifies the people who need to know.
 */

export type MoveStageFailureCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "BLOCKED"
  | "OVERRIDE_NOT_PERMITTED"
  | "OVERRIDE_INVALID"
  | "STAGE_DEPRECATED"
  | "STALE"
  | "PIPELINE_MISMATCH";

/**
 * Thrown inside the transaction when the account moved under us.
 *
 * A thrown error is what rolls the whole thing back - returning a failure from
 * inside would leave the history entry and the generated work already written
 * against a move that never happened.
 */
class StaleJourneyError extends Error {}

export interface StageOverrideRequest {
  reason: string;
  riskAcknowledged: boolean;
}

export interface MoveClientStageInput {
  clientId: string;
  targetStageId: string;
  actor: AuthContext;
  note?: string | null;
  override?: StageOverrideRequest | null;
  /** Recorded on the activity entry for auditing. */
  origin?: string | null;
}

export type MoveClientStageResult =
  | {
      ok: true;
      noChange: boolean;
      wasOverridden: boolean;
      unmet: RequirementEvaluation[];
      createdTaskCount: number;
      /** The seat the client was handed to, when ownership changed. */
      handedOffTo?: string | null;
    }
  | {
      ok: false;
      code: MoveStageFailureCode;
      message: string;
      blocking?: RequirementEvaluation[];
    };

/** An override reason has to say something. */
const MIN_OVERRIDE_REASON_LENGTH = 10;

export async function moveClientStage(
  input: MoveClientStageInput,
): Promise<MoveClientStageResult> {
  const { actor, clientId, targetStageId } = input;

  if (!can(actor, "journey.move")) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You do not have permission to move accounts between stages.",
    };
  }

  const [client, targetStage] = await Promise.all([
    loadClientForEvaluation(clientId),
    prisma.pipelineStage.findUnique({
      where: { id: targetStageId },
      select: {
        id: true,
        name: true,
        stageKey: true,
        pipelineId: true,
        isDeprecated: true,
        requirements: {
          select: { requirementKey: true, label: true, isBlocking: true },
          orderBy: { position: "asc" },
        },
      },
    }),
  ]);

  if (!client) {
    return { ok: false, code: "NOT_FOUND", message: "Client not found." };
  }

  if (!targetStage) {
    return { ok: false, code: "NOT_FOUND", message: "Pipeline stage not found." };
  }

  if (client.currentStageId === targetStage.id) {
    return {
      ok: true,
      noChange: true,
      wasOverridden: false,
      unmet: [],
      createdTaskCount: 0,
      handedOffTo: null,
    };
  }

  if (targetStage.isDeprecated) {
    return {
      ok: false,
      code: "STAGE_DEPRECATED",
      message: `"${targetStage.name}" is a retired stage and cannot take new accounts.`,
    };
  }

  if (targetStage.pipelineId !== client.currentStage.pipelineId) {
    return {
      ok: false,
      code: "PIPELINE_MISMATCH",
      message: "An account cannot be moved into a stage from a different pipeline.",
    };
  }

  const gate = evaluateStageRequirements(client, targetStage.requirements);
  const requestedOverride = input.override;
  let wasOverridden = false;

  if (!gate.passed) {
    if (!requestedOverride) {
      return {
        ok: false,
        code: "BLOCKED",
        message: `"${targetStage.name}" has ${gate.blocking.length} unmet requirement(s).`,
        blocking: gate.blocking,
      };
    }

    if (!can(actor, "journey.override")) {
      return {
        ok: false,
        code: "OVERRIDE_NOT_PERMITTED",
        message: "You do not have permission to override a stage requirement.",
        blocking: gate.blocking,
      };
    }

    const reason = requestedOverride.reason?.trim() ?? "";

    if (reason.length < MIN_OVERRIDE_REASON_LENGTH || !requestedOverride.riskAcknowledged) {
      return {
        ok: false,
        code: "OVERRIDE_INVALID",
        message:
          "An override needs a written reason of at least "
          + `${MIN_OVERRIDE_REASON_LENGTH} characters and an explicit risk acknowledgement.`,
        blocking: gate.blocking,
      };
    }

    wasOverridden = true;
  }

  const now = new Date();
  /*
   * The stage's own work, plus the build work for what this client bought.
   *
   * Service templates land once, on the way into production: before that
   * there is nothing to build, and after it the work already exists. Each
   * carries where it came from, so the same template cannot arrive twice.
   */
  const templates = [
    ...getStageTaskTemplates(targetStage.stageKey).map((template) => ({
      template,
      // Never reached with a null key - that yields no templates - but the
      // fallback keeps the key a string rather than leaning on that.
      source: targetStage.stageKey ?? "stage",
    })),
    ...(targetStage.stageKey === "in_production"
      ? getServiceTaskTemplates(client.serviceType).map((template) => ({
          template,
          source: `service:${client.serviceType}`,
        }))
      : []),
  ];

  /*
   * What this client already has from a template.
   *
   * A client moved back for revisions and forward again runs this a second
   * time, and without the check would collect a duplicate of everything the
   * stage creates. Cancelled and archived rows count too: the work was
   * generated once and somebody decided about it, and generating it again
   * would overrule them.
   */
  const alreadyGenerated = new Set(
    (
      await prisma.employeeTask.findMany({
        where: { clientId: client.id, templateKey: { not: null } },
        select: { templateKey: true },
      })
    ).map((task) => task.templateKey!),
  );

  // Make sure the client has the workstreams its service calls for before any
  // task is routed at a specialist seat, or the first move into production
  // would route at seats that do not exist yet.
  await syncWorkstreams({ clientId: client.id, service: client.serviceType });

  const assigneeCandidates = {
    accountOwnerId: client.assignedUserId,
    projectManagerId: client.projects.find((project) => project.projectManagerId)
      ?.projectManagerId ?? null,
    actorId: actor.id,
    workstreamOwners: await workstreamOwners(client.id),
  };

  const generatedTasks = templates
    .map(({ template, source }) => ({
      template,
      key: templateKeyFor(source, template.title),
    }))
    .filter(({ key }) => !alreadyGenerated.has(key))
    .map(({ template, key }) => {
      const dueDate = addDays(now, template.dueInDays);

      return {
        title: template.title,
        note: template.note,
        category: template.category,
        priority: template.priority,
        estimatedHours: template.estimatedHours,
        dueDate,
        weekStartDate: dueDate,
        assignedToId: resolveAssignee(template.assignTo, assigneeCandidates),
        createdById: actor.id,
        clientId: client.id,
        projectId: client.projects[0]?.id ?? null,
        isClientFacing: template.isClientFacing ?? false,
        requiresQa: template.requiresQa ?? false,
        requiresApproval: template.requiresApproval ?? false,
        completionCriteria: template.completionCriteria ?? null,
        templateKey: key,
      };
    });

  // The move, its history entry, and the work it generates land together or
  // not at all. A stage change with no follow-up work is a silent process gap.
  try {
  await prisma.$transaction(async (transaction) => {
    /*
     * The move only lands if the account is still where we validated it.
     *
     * Two people advancing at once used to both succeed: each read the same
     * stage, each validated against it, and each wrote. The result was two
     * history entries and a doubled set of entry actions for one real move.
     * The stage we checked is the version - if it has changed, this decision
     * was made about an account that no longer exists in that state, and the
     * safe thing is to make somebody look again rather than apply it.
     *
     * This also covers the double click, which is the same race with one
     * person in it.
     */
    const moved = await transaction.client.updateMany({
      where: { id: client.id, currentStageId: client.currentStageId },
      data: {
        currentStageId: targetStage.id,
        stageEnteredAt: now,
      },
    });

    if (moved.count === 0) {
      throw new StaleJourneyError();
    }

    await transaction.clientStageHistory.create({
      data: {
        clientId: client.id,
        fromStageId: client.currentStageId,
        toStageId: targetStage.id,
        changedById: actor.id,
        changedAt: now,
        note:
          input.note?.trim()
          || `Moved from ${client.currentStage.name} to ${targetStage.name}.`,
        wasOverridden,
        overrideReason: wasOverridden ? requestedOverride?.reason.trim() : null,
        overrideApprovedById: wasOverridden ? actor.id : null,
        overrideRiskAcknowledged: wasOverridden,
        unmetRequirements: gate.unmet.length
          ? gate.unmet.map((evaluation) => ({
              key: evaluation.key,
              label: evaluation.label,
              isBlocking: evaluation.isBlocking,
              reason: evaluation.reason,
            }))
          : undefined,
      },
    });

    if (generatedTasks.length) {
      await transaction.employeeTask.createMany({ data: generatedTasks, skipDuplicates: true });
    }
  });
  } catch (error) {
    if (error instanceof StaleJourneyError) {
      return {
        ok: false as const,
        code: "STALE" as const,
        message:
          "This journey was updated by somebody else while you were looking at it. "
          + "The latest state has been loaded - please review it before moving the account.",
      };
    }

    throw error;
  }

  await logActivity({
    actorId: actor.id,
    action: wasOverridden
      ? `Moved ${client.companyName} into ${targetStage.name} by overriding ${gate.blocking.length} requirement(s)`
      : `Moved ${client.companyName} into ${targetStage.name}`,
    entityType: "PIPELINE",
    entityId: client.id,
    fieldName: "currentStageId",
    previousValue: client.currentStage.name,
    newValue: targetStage.name,
    origin: input.origin ?? null,
    metadataJson: {
      wasOverridden,
      overrideReason: wasOverridden ? requestedOverride?.reason.trim() : null,
      unmetRequirements: gate.unmet.map((evaluation) => evaluation.key),
      generatedTaskCount: generatedTasks.length,
    },
  });

  // The handoff is recorded after the move rather than inside it: the client
  // has genuinely changed hands only once the stage change has committed, and
  // a handoff row pointing at a transaction that rolled back would be a lie in
  // the one place people go to read the history.
  const handoff = await recordHandoff({
    clientId: client.id,
    companyName: client.companyName,
    service: client.serviceType,
    toStageKey: targetStage.stageKey,
    actorId: actor.id,
    fromRole: client.currentOwnerRole,
    fromUserId: client.currentOwnerId,
    note: wasOverridden ? requestedOverride?.reason.trim() : null,
  });

  await notifyStageChange({
    actor,
    client,
    targetStageName: targetStage.name,
    wasOverridden,
    blocking: gate.blocking,
    generatedTaskAssigneeIds: generatedTasks.map((task) => task.assignedToId),
  });

  return {
    ok: true,
    noChange: false,
    wasOverridden,
    unmet: gate.unmet,
    createdTaskCount: generatedTasks.length,
    handedOffTo: handoff?.toRole ?? null,
  };
}

interface NotifyStageChangeInput {
  actor: AuthContext;
  client: { id: string; companyName: string; assignedUserId: string | null };
  targetStageName: string;
  wasOverridden: boolean;
  blocking: RequirementEvaluation[];
  generatedTaskAssigneeIds: string[];
}

async function notifyStageChange(input: NotifyStageChangeInput) {
  const { actor, client, targetStageName } = input;

  const notifications = [];

  const stageWatchers = resolveRecipients([client.assignedUserId], actor.id);

  for (const recipientId of stageWatchers) {
    notifications.push({
      recipientId,
      type: "CLIENT_HEALTH_CHANGE" as const,
      urgency: "NORMAL" as const,
      title: `${client.companyName} moved to ${targetStageName}`,
      body: `${actor.name} moved this account into ${targetStageName}.`,
      entityType: "CLIENT" as const,
      entityId: client.id,
      href: `/clients/${client.id}`,
    });
  }

  for (const recipientId of resolveRecipients(input.generatedTaskAssigneeIds, actor.id)) {
    notifications.push({
      recipientId,
      type: "TASK_ASSIGNED" as const,
      urgency: "HIGH" as const,
      title: `New work assigned on ${client.companyName}`,
      body: `Moving this account to ${targetStageName} created work assigned to you.`,
      entityType: "CLIENT" as const,
      entityId: client.id,
      href: `/clients/${client.id}`,
    });
  }

  // An override is a governance event: everyone who can audit needs to see it,
  // not just the people working the account.
  if (input.wasOverridden) {
    const overseers = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          { role: { in: ["OWNER", "ADMIN"] } },
          { position: { in: ["AGENCY_OWNER", "AGENCY_DIRECTOR", "OPERATIONS_MANAGER"] } },
        ],
      },
      select: { id: true },
    });

    for (const recipientId of resolveRecipients(
      overseers.map((overseer) => overseer.id),
      actor.id,
    )) {
      notifications.push({
        recipientId,
        type: "STAGE_OVERRIDE" as const,
        urgency: "CRITICAL" as const,
        title: `Stage requirement overridden on ${client.companyName}`,
        body:
          `${actor.name} moved this account into ${targetStageName} with `
          + `${input.blocking.length} unmet requirement(s): `
          + `${input.blocking.map((evaluation) => evaluation.label).join(", ")}.`,
        entityType: "CLIENT" as const,
        entityId: client.id,
        href: `/clients/${client.id}`,
      });
    }
  }

  await createNotifications(notifications);
}
