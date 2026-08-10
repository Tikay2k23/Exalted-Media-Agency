import type { WorkstreamStage } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { moveClientStage } from "@/lib/journey/transition";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { deriveSyncCandidate, isWaitingOnClient } from "@/lib/workflow/workstream-board";

/**
 * Moving one seat's work along its own board, and letting the master journey
 * follow when it genuinely should.
 */

export type WorkstreamFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "BLOCKER_REQUIRED";

export interface WorkstreamFailure {
  ok: false;
  code: WorkstreamFailureCode;
  message: string;
}

function failure(code: WorkstreamFailureCode, message: string): WorkstreamFailure {
  return { ok: false, code, message };
}

export const WORKSTREAM_FAILURE_STATUS: Record<WorkstreamFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  BLOCKER_REQUIRED: 409,
};

/**
 * Moves a workstream to a new stage.
 *
 * Parking work as blocked requires saying what it is blocked on. "Waiting on
 * assets" with no note is the state a card dies in: nobody knows what to chase,
 * so nobody chases it.
 */
export async function moveWorkstream(input: {
  actor: AuthContext;
  workstreamId: string;
  stage: WorkstreamStage;
  blockedReason?: string | null;
}) {
  const { actor, workstreamId, stage } = input;

  const workstream = await prisma.clientWorkstream.findUnique({
    where: { id: workstreamId },
    select: {
      id: true,
      role: true,
      stage: true,
      ownerId: true,
      clientId: true,
      client: {
        select: {
          id: true,
          companyName: true,
          assignedUserId: true,
          currentStage: { select: { id: true, stageKey: true, pipelineId: true } },
        },
      },
    },
  });

  if (!workstream) {
    return failure("NOT_FOUND", "That work could not be found.");
  }

  // The person doing the work moves their own card. Anyone who can manage
  // projects can move anybody's, because a project manager rebalancing the
  // board is the normal way this gets unstuck.
  const isOwnWork = workstream.ownerId === actor.id;

  if (!isOwnWork && !can(actor, "projects.manage")) {
    return failure("FORBIDDEN", "This is not your work to move.");
  }

  if (stage === "NOT_REQUIRED") {
    return failure(
      "INVALID",
      "Whether a seat is needed comes from the purchased service, not from the board.",
    );
  }

  const blockedReason = input.blockedReason?.trim() || null;

  if (isWaitingOnClient(stage) && !blockedReason) {
    return failure(
      "BLOCKER_REQUIRED",
      "Say what you are waiting for. A card parked with no reason is one nobody chases.",
    );
  }

  const previous = workstream.stage;

  if (previous === stage && blockedReason === null) {
    // Re-read rather than returning the partial row loaded above, so callers
    // always get the same shape whether anything moved or not.
    return {
      ok: true as const,
      workstream: await prisma.clientWorkstream.findUniqueOrThrow({
        where: { id: workstream.id },
      }),
      moved: false,
      journeyMoved: null as JourneySyncOutcome | null,
    };
  }

  const updated = await prisma.clientWorkstream.update({
    where: { id: workstream.id },
    data: {
      stage,
      blockedReason: isWaitingOnClient(stage) ? blockedReason : null,
      ...(previous === "ASSIGNED" && stage !== "ASSIGNED" ? { startedAt: new Date() } : {}),
      ...(stage === "COMPLETE" ? { completedAt: new Date() } : { completedAt: null }),
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `${workstream.client.companyName}: ${workstream.role
      .toLowerCase()
      .replaceAll("_", " ")} work moved to ${stage.toLowerCase().replaceAll("_", " ")}`,
    entityType: "CLIENT",
    entityId: workstream.clientId,
    fieldName: "workstreamStage",
    previousValue: previous,
    newValue: stage,
    metadataJson: { workstreamId: workstream.id, blockedReason },
  });

  // Somebody has to know the client is holding this up.
  if (isWaitingOnClient(stage)) {
    await createNotifications(
      resolveRecipients([workstream.client.assignedUserId], actor.id).map((recipientId) => ({
        recipientId,
        type: "CLIENT_WAITING" as const,
        urgency: "HIGH" as const,
        title: `${workstream.client.companyName} is holding up ${workstream.role
          .toLowerCase()
          .replaceAll("_", " ")} work`,
        body: blockedReason ?? "",
        entityType: "CLIENT" as const,
        entityId: workstream.clientId,
        href: `/clients/${workstream.clientId}`,
      })),
    );
  }

  const journeyMoved = await syncMasterJourney({
    actor,
    clientId: workstream.clientId,
    companyName: workstream.client.companyName,
    accountOwnerId: workstream.client.assignedUserId,
    currentStageKey: workstream.client.currentStage.stageKey,
    pipelineId: workstream.client.currentStage.pipelineId,
  });

  return { ok: true as const, workstream: updated, moved: true, journeyMoved };
}

export interface JourneySyncOutcome {
  stageKey: string;
  reason: string;
  moved: boolean;
  /** Why it did not move, when the stage gate refused. */
  blockedBy?: string[];
  /**
   * The work is done and the account is ready, but this person may not move
   * accounts. The project manager has been told.
   */
  awaitingApproval?: boolean;
}

/**
 * Lets the master journey follow the boards, but only through the front door.
 *
 * The move goes through moveClientStage with no override, so the stage gate
 * decides. If the gate blocks, nothing moves and the reason is returned - the
 * account stays where it is and somebody has to go and satisfy the requirement.
 * A board that could quietly advance an account past an unmet requirement would
 * undo the entire point of the gates.
 */
async function syncMasterJourney(input: {
  actor: AuthContext;
  clientId: string;
  companyName: string;
  accountOwnerId: string | null;
  currentStageKey: string | null;
  pipelineId: string;
}): Promise<JourneySyncOutcome | null> {
  const streams = await prisma.clientWorkstream.findMany({
    where: { clientId: input.clientId },
    select: { role: true, stage: true, isRequired: true },
  });

  const candidate = deriveSyncCandidate(input.currentStageKey, streams);

  if (!candidate) {
    return null;
  }

  const target = await prisma.pipelineStage.findFirst({
    where: {
      stageKey: candidate.stageKey,
      pipelineId: input.pipelineId,
      isDeprecated: false,
    },
    select: { id: true },
  });

  if (!target) {
    return null;
  }

  /*
   * A specialist finishing their work does not hold `journey.move` - moving
   * accounts is the project manager's job. Pushing the move through anyway
   * would mean the board quietly exercising a permission its user does not
   * have, which is exactly the kind of shortcut the permission model exists to
   * prevent.
   *
   * So the account waits, and the person who can move it is told it is ready.
   * The alternative found in testing was worse than useless: the move failed
   * as "forbidden", and with no blocking requirements to report it read as
   * "ready to advance, blocked by nothing" while nothing happened.
   */
  if (!can(input.actor, "journey.move")) {
    await createNotifications(
      resolveRecipients([input.accountOwnerId], input.actor.id).map((recipientId) => ({
        recipientId,
        type: "TASK_ASSIGNED" as const,
        urgency: "HIGH" as const,
        title: `${input.companyName} is ready to move on`,
        body: `${candidate.reason} Move it to ${candidate.stageKey.replaceAll("_", " ")} when you are happy.`,
        entityType: "CLIENT" as const,
        entityId: input.clientId,
        href: `/clients/${input.clientId}`,
      })),
    );

    return { ...candidate, moved: false, awaitingApproval: true };
  }

  const result = await moveClientStage({
    clientId: input.clientId,
    targetStageId: target.id,
    actor: input.actor,
    note: `Moved automatically: ${candidate.reason}`,
    origin: "workstream-sync",
  });

  if (!result.ok) {
    return {
      ...candidate,
      moved: false,
      blockedBy: (result.blocking ?? []).map((item) => item.label),
    };
  }

  return { ...candidate, moved: !result.noChange };
}

/** Assigns or reassigns the person in a seat. */
export async function assignWorkstream(input: {
  actor: AuthContext;
  workstreamId: string;
  ownerId: string | null;
}) {
  const { actor, workstreamId } = input;

  if (!can(actor, "workItems.assign")) {
    return failure("FORBIDDEN", "You do not have permission to assign work.");
  }

  const workstream = await prisma.clientWorkstream.findUnique({
    where: { id: workstreamId },
    select: {
      id: true,
      role: true,
      ownerId: true,
      clientId: true,
      client: { select: { companyName: true } },
    },
  });

  if (!workstream) {
    return failure("NOT_FOUND", "That work could not be found.");
  }

  let ownerId = input.ownerId?.trim() || null;

  if (ownerId) {
    // The seat is the point: putting an ads specialist on the creative
    // workstream would make the board lie about who does what.
    const candidate = await prisma.user.findFirst({
      where: {
        id: ownerId,
        isActive: true,
        deletedAt: null,
        teamRole: workstream.role,
      },
      select: { id: true },
    });

    if (!candidate) {
      return failure(
        "INVALID",
        "That person does not hold this seat. Pick somebody in the right role.",
      );
    }

    ownerId = candidate.id;
  }

  const updated = await prisma.clientWorkstream.update({
    where: { id: workstream.id },
    data: { ownerId },
  });

  await logActivity({
    actorId: actor.id,
    action: ownerId
      ? `Assigned ${workstream.role.toLowerCase().replaceAll("_", " ")} work on ${workstream.client.companyName}`
      : `Unassigned ${workstream.role.toLowerCase().replaceAll("_", " ")} work on ${workstream.client.companyName}`,
    entityType: "CLIENT",
    entityId: workstream.clientId,
    fieldName: "workstreamOwner",
    previousValue: workstream.ownerId,
    newValue: ownerId,
  });

  await createNotifications(
    resolveRecipients([ownerId], actor.id).map((recipientId) => ({
      recipientId,
      type: "TASK_ASSIGNED" as const,
      urgency: "NORMAL" as const,
      title: `${workstream.client.companyName} is on your board`,
      body: `You have the ${workstream.role.toLowerCase().replaceAll("_", " ")} work on this account.`,
      entityType: "CLIENT" as const,
      entityId: workstream.clientId,
      href: `/work`,
    })),
  );

  return { ok: true as const, workstream: updated };
}
