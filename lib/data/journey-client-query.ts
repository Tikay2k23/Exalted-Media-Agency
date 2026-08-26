import { type AuthContext } from "@/lib/authz";
import {
  buildJourneyAccount,
  journeyAccountSelect,
  type StageForAccount,
  type StageRule,
} from "@/lib/data/journey-queries";
import {
  type DetailContact,
  type DetailTask,
  type JourneyClientDetail,
  type JourneyFlag,
  type TimelineMilestone,
} from "@/lib/journey/client-detail";
import { type JourneyActivityEntry } from "@/lib/journey/journey-board";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FULFILLMENT_PIPELINE_ID } from "@/lib/workspace-defaults";

/**
 * One client's journey page, in three queries.
 *
 * The account is built by the same function the board uses, from the same
 * selection, so a card saying 68% and this page saying 68% is guaranteed
 * rather than coincidental. Only the detail the board has no use for -
 * contacts, the task list itself, raised flags, the activity feed - is added
 * on top.
 */

export interface JourneyClientDetailResult {
  detail: JourneyClientDetail | null;
  /** True when the client exists but this user may not see it. */
  forbidden: boolean;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function activityKind(action: string): JourneyActivityEntry["kind"] {
  const text = action.toLowerCase();

  if (text.includes("overrid")) return "override";
  if (text.includes("moved") || text.includes("stage")) return "stage";
  if (text.includes("block")) return "blocker";
  if (text.includes("approv") || text.includes("review")) return "approval";
  if (text.includes("asset") || text.includes("access") || text.includes("upload")) {
    return "asset";
  }
  if (text.includes("milestone")) return "milestone";

  return "other";
}

export async function getJourneyClientDetail(
  actor: AuthContext,
  clientId: string,
): Promise<JourneyClientDetailResult> {
  const seesEverything = can(actor, "clients.view.all");

  try {
    const [stages, client] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: { pipelineId: FULFILLMENT_PIPELINE_ID, isDeprecated: false },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          position: true,
          // So the upcoming-stage card can say what entering it will do.
          stageKey: true,
          requirements: {
            orderBy: { position: "asc" },
            select: { requirementKey: true, label: true, isBlocking: true },
          },
        },
      }),
      prisma.client.findFirst({
        where: {
          id: clientId,
          deletedAt: null,
          ...(seesEverything ? {} : { assignedUserId: actor.id }),
        },
        select: {
          /*
           * The board's selection, widened where this page needs more of the
           * same relation. Spreading rather than restating keeps the account
           * fields in one place; the overrides below are supersets, so every
           * stage-gate checker still gets what it reads.
           */
          ...journeyAccountSelect,
          contacts: {
            orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
            select: {
              name: true,
              email: true,
              phone: true,
              role: true,
              isPrimary: true,
              isApprover: true,
            },
          },
          agencyTasks: {
            where: { deletedAt: null },
            orderBy: { dueDate: "asc" },
            select: {
              id: true,
              title: true,
              status: true,
              category: true,
              priority: true,
              assignedToId: true,
              dueDate: true,
              estimatedHours: true,
              actualHours: true,
              assignedTo: { select: { name: true } },
            },
          },
          journeyFlags: {
            where: { resolvedAt: null },
            orderBy: { raisedAt: "desc" },
            select: {
              id: true,
              kind: true,
              reason: true,
              detail: true,
              responsibleParty: true,
              dueAt: true,
              round: true,
              raisedAt: true,
              raisedBy: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    if (!client) {
      return { detail: null, forbidden: false };
    }

    const requirementsByStageId = new Map<string, StageRule[]>(
      stages.map((stage) => [stage.id, stage.requirements]),
    );

    const liveStages: StageForAccount[] = stages;

    const account = buildJourneyAccount(client, requirementsByStageId, liveStages);
    const stageSteps = liveStages
      .map((stage) => ({ id: stage.id, name: stage.name, position: stage.position }))
      .sort((a, b) => a.position - b.position);

    const tasks: DetailTask[] = client.agencyTasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate.toISOString(),
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      assigneeName: task.assignedTo?.name ?? null,
    }));

    const contacts: DetailContact[] = client.contacts.map((contact) => ({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
      isPrimary: contact.isPrimary,
    }));

    const flags: JourneyFlag[] = client.journeyFlags.map((flag) => ({
      id: flag.id,
      kind: flag.kind,
      reason: flag.reason,
      detail: flag.detail,
      responsibleParty: flag.responsibleParty,
      dueAt: iso(flag.dueAt),
      round: flag.round,
      raisedByName: flag.raisedBy?.name ?? null,
      raisedAt: flag.raisedAt.toISOString(),
    }));

    /*
     * The milestone rail.
     *
     * Built from the account's own milestone list so the page and the board
     * agree on what is due. The current one is the earliest that is not yet
     * done - the thing the team is working towards, which is what the rail is
     * for.
     */
    const ordered = [...account.milestones].sort(
      (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
    );
    const currentId = ordered.find((milestone) => !milestone.completed)?.id ?? null;

    const milestones: TimelineMilestone[] = ordered.map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      dueAt: milestone.dueAt,
      completed: milestone.completed,
      isCurrent: milestone.id === currentId,
      source: milestone.source,
    }));

    const activityRows = await prisma.activityLog.findMany({
      where: { entityType: { in: ["PIPELINE", "CLIENT"] }, entityId: client.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    });

    const activity: JourneyActivityEntry[] = activityRows.map((row) => ({
      id: row.id,
      clientId: client.id,
      companyName: client.companyName,
      action: row.action,
      actorName: row.actor?.name ?? null,
      createdAt: row.createdAt.toISOString(),
      kind: activityKind(row.action),
    }));

    const launch = client.projects
      .filter((project) => project.targetLaunchDate)
      .sort(
        (a, b) =>
          (a.targetLaunchDate?.getTime() ?? 0) - (b.targetLaunchDate?.getTime() ?? 0),
      )[0];

    return {
      detail: {
        account,
        stages: stageSteps,
        flags,
        tasks,
        contacts,
        milestones,
        activity,
        projectStartDate: iso(client.contractStartDate),
        targetLaunchDate: iso(launch?.targetLaunchDate),
        renewalDate: iso(client.renewalDate) ?? iso(client.contractEndDate),
        canMove: can(actor, "journey.move"),
        canOverride: can(actor, "journey.override"),
        // Raising and clearing a secondary status is delivery coordination,
        // which is what clients.edit already covers.
        canManageFlags: can(actor, "clients.edit"),
      },
      forbidden: false,
    };
  } catch (error) {
    console.error("[journey-client-query] Failed to load the client journey.", error);
    return { detail: null, forbidden: false };
  }
}
