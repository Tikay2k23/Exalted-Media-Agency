import type { Prisma } from "@prisma/client";

import {
  AccessStatus,
  DefectStatus,
  EmployeeTaskStatus,
  ReviewStatus,
} from "@prisma/client";

import { pausedDaysInStage } from "@/lib/journey/dependency";
import { type AuthContext } from "@/lib/authz";
import {
  type JourneyAccount,
  type JourneyActivityEntry,
  type JourneyHistoryEntry,
  type JourneyMilestone,
  type JourneyRequirement,
} from "@/lib/journey/journey-board";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FULFILLMENT_PIPELINE_ID } from "@/lib/workspace-defaults";

/**
 * Everything the Journey board reads, in two queries.
 *
 * One for the accounts and one for the activity feed. The account query is a
 * superset of journeyEvaluationSelect, which means the stage gates can be
 * evaluated in memory from the same rows the board is already drawing rather
 * than re-fetching each account to ask whether it may advance. That matters
 * more than it looks: the hosted database allows fifty connections in total,
 * and a per-card round trip is how a board of thirty accounts takes the site
 * down.
 *
 * Nothing here decides anything. Health, progress, aging, attention and
 * milestone order are all derived in lib/journey/journey-board.ts so they can
 * be tested without a database.
 */

/** Task statuses that still need somebody to do something. */
const OPEN_TASK_STATUSES = new Set<EmployeeTaskStatus>([
  EmployeeTaskStatus.BACKLOG,
  EmployeeTaskStatus.TODO,
  EmployeeTaskStatus.IN_PROGRESS,
  EmployeeTaskStatus.WAITING_CLIENT,
  EmployeeTaskStatus.BLOCKED,
  EmployeeTaskStatus.NEEDS_REVIEW,
  EmployeeTaskStatus.REVISION_REQUIRED,
]);

const DONE_TASK_STATUSES = new Set<EmployeeTaskStatus>([
  EmployeeTaskStatus.APPROVED,
  EmployeeTaskStatus.DONE,
]);

/**
 * Access states that mean the agency still cannot get in.
 *
 * Written as "anything but these" so a state added to the enum later counts as
 * a problem until somebody decides otherwise, which is the safe default.
 */
const ACCESS_USABLE = new Set<AccessStatus>([
  AccessStatus.GRANTED,
  AccessStatus.TESTED,
  AccessStatus.NOT_APPLICABLE,
]);

const CLOSED_DEFECT_STATUSES = new Set<DefectStatus>([
  DefectStatus.CLOSED,
  DefectStatus.WONT_FIX,
]);

/** Review rounds sitting with the client rather than with the agency. */
const AWAITING_CLIENT_REVIEW = new Set<ReviewStatus>([
  ReviewStatus.SENT,
  ReviewStatus.AWAITING_FEEDBACK,
]);

export interface JourneyStageOption {
  id: string;
  name: string;
  stageKey: string | null;
  color: string;
  position: number;
  slaDays: number | null;
  isTerminal: boolean;
  isDeprecated: boolean;
  requirementCount: number;
}

export interface JourneyOwnerOption {
  id: string;
  name: string;
}

export interface JourneyWorkspaceData {
  accounts: JourneyAccount[];
  stages: JourneyStageOption[];
  owners: JourneyOwnerOption[];
  services: string[];
  activity: JourneyActivityEntry[];
  canMove: boolean;
  canOverride: boolean;
  isDegraded: boolean;
}

const EMPTY: JourneyWorkspaceData = {
  accounts: [],
  stages: [],
  owners: [],
  services: [],
  activity: [],
  canMove: false,
  canOverride: false,
  isDegraded: true,
};

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

/** Classifies a log line so the feed can badge it without storing a type. */
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


/**
 * The one selection a journey account is built from.
 *
 * Shared by the board and by a single client's page so the two can never show
 * different numbers for the same account. It is a superset of
 * journeyEvaluationSelect, which is what lets the stage gates be evaluated
 * from these same rows instead of a second round trip per card.
 */
export const journeyAccountSelect = {
  id: true,
  companyName: true,
  clientName: true,
  status: true,
  healthStatus: true,
  serviceType: true,
  stageEnteredAt: true,
  /* Pause records, so the stage clock can stop while an account is parked. */
  journeyFlags: {
    where: { kind: "PAUSED" },
    select: { raisedAt: true, resolvedAt: true },
  },
  currentBlocker: true,
  nextAction: true,
  nextActionDueAt: true,
  lastClientUpdateAt: true,
  renewalDate: true,
  contractEndDate: true,
  contractStartDate: true,
  monthlyValue: true,
  assignedUserId: true,
  assignedUser: { select: { id: true, name: true } },
  currentStage: {
    select: {
      id: true,
      name: true,
      stageKey: true,
      color: true,
      position: true,
      slaDays: true,
      isDeprecated: true,
    },
  },

  // From here down the selection is shaped by EvaluableClient, so the
  // stage gates can be evaluated from these same rows.
  contacts: { select: { isPrimary: true, isApprover: true } },
  invoices: { where: { deletedAt: null }, select: { status: true } },
  accessRecords: {
    select: { platform: true, isCritical: true, status: true },
  },
  healthAssessments: {
    take: 1,
    orderBy: { assessedAt: "desc" },
    select: { status: true, satisfactionScore: true },
  },
  strategyBrief: {
    select: {
      status: true,
      primaryGoal: true,
      successMetrics: true,
      targetAudience: true,
      mainOffer: true,
      agencyResponsibilities: true,
      clientResponsibilities: true,
    },
  },
  defects: { select: { reference: true, severity: true, status: true } },
  approvals: {
    select: {
      type: true,
      status: true,
      approvedByName: true,
      evidenceUrl: true,
      notes: true,
    },
  },
  offboarding: {
    select: {
      clientAdminAccessConfirmedAt: true,
      finalBillingSettledAt: true,
    },
  },
  agencyTasks: {
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      status: true,
      category: true,
      priority: true,
      assignedToId: true,
      dueDate: true,
    },
  },
  launches: {
    select: {
      id: true,
      status: true,
      scheduledFor: true,
      completedAt: true,
      backupVerifiedAt: true,
      rollbackPlan: true,
      ownerId: true,
    },
  },
  projects: {
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      serviceType: true,
      projectManagerId: true,
      targetLaunchDate: true,
      projectManager: { select: { name: true } },
      milestones: {
        orderBy: { dueDate: "asc" },
        select: { id: true, name: true, dueDate: true, completedAt: true },
      },
    },
  },

  // Board-only additions.
  reviewCycles: { select: { id: true, status: true, feedbackDeadline: true } },
  intakeForm: { select: { status: true } },
  stageHistory: {
    take: 15,
    orderBy: { changedAt: "desc" },
    select: {
      id: true,
      changedAt: true,
      note: true,
      wasOverridden: true,
      overrideReason: true,
      fromStage: { select: { name: true } },
      toStage: { select: { name: true } },
      changedBy: { select: { name: true } },
    },
  },
} satisfies Prisma.ClientSelect;

export type JourneyAccountRow = Prisma.ClientGetPayload<{
  select: typeof journeyAccountSelect;
}>;

export interface StageRule {
  requirementKey: string;
  label: string;
  isBlocking: boolean;
}

export interface StageForAccount {
  id: string;
  position: number;
  name: string;
  /** Stable key, so callers can look up what entering the stage does. */
  stageKey?: string | null;
  requirements: StageRule[];
}

/**
 * Turns one selected row into the account shape everything else derives from.
 *
 * Extracted rather than repeated: the board and the client page both need it,
 * and two copies would drift the first time a count or a milestone rule
 * changed in one of them.
 */
export function buildJourneyAccount(
  client: JourneyAccountRow,
  requirementsByStageId: Map<string, StageRule[]>,
  liveStages: StageForAccount[],
): JourneyAccount {
  const stage = client.currentStage;

  const nextStage =
    liveStages.find((candidate) => candidate.position > stage.position) ?? null;

  const evaluate = (stageId: string | null): JourneyRequirement[] => {
    const rules = stageId ? requirementsByStageId.get(stageId) : undefined;

    if (!rules || rules.length === 0) return [];

    return evaluateStageRequirements(client, rules).evaluations.map((evaluation) => ({
      key: evaluation.key,
      label: evaluation.label,
      owner: evaluation.owner,
      isBlocking: evaluation.isBlocking,
      satisfied: evaluation.satisfied,
      reason: evaluation.reason,
    }));
  };

  const openTasks = client.agencyTasks.filter((task) =>
    OPEN_TASK_STATUSES.has(task.status),
  );
  const now = new Date();

  const milestones: JourneyMilestone[] = [];

  for (const project of client.projects) {
    for (const milestone of project.milestones) {
      if (!milestone.dueDate) continue;

      milestones.push({
        id: milestone.id,
        clientId: client.id,
        companyName: client.companyName,
        name: milestone.name,
        source: "milestone",
        dueAt: milestone.dueDate.toISOString(),
        completed: milestone.completedAt !== null,
      });
    }

    if (project.targetLaunchDate) {
      milestones.push({
        id: `${project.id}-launch`,
        clientId: client.id,
        companyName: client.companyName,
        name: `${project.name} launch`,
        source: "launch",
        dueAt: project.targetLaunchDate.toISOString(),
        completed: false,
      });
    }
  }

  for (const launch of client.launches) {
    if (!launch.scheduledFor) continue;

    milestones.push({
      id: launch.id,
      clientId: client.id,
      companyName: client.companyName,
      name: "Launch",
      source: "launch",
      dueAt: launch.scheduledFor.toISOString(),
      completed: launch.completedAt !== null,
    });
  }

  if (client.nextAction && client.nextActionDueAt) {
    milestones.push({
      id: `${client.id}-next-action`,
      clientId: client.id,
      companyName: client.companyName,
      name: client.nextAction,
      source: "next-action",
      dueAt: client.nextActionDueAt.toISOString(),
      completed: false,
    });
  }

  const renewal = client.renewalDate ?? client.contractEndDate;

  if (renewal) {
    milestones.push({
      id: `${client.id}-renewal`,
      clientId: client.id,
      companyName: client.companyName,
      name: "Renewal",
      source: "renewal",
      dueAt: renewal.toISOString(),
      completed: false,
    });
  }

  /*
   * The date this stage is expected to end.
   *
   * Derived from stageEnteredAt plus the stage's own slaDays rather than
   * typed in by anybody, which is what makes it available on every account
   * instead of only the ones somebody remembered to schedule. It is listed
   * last so a real milestone always sorts ahead of it on the same day, and
   * it is excluded from the overdue checks - a stage running long is
   * already reported as stage aging, and counting it twice would make
   * every late account look like it had missed a deliverable as well.
   */
  if (stage.slaDays !== null && !stage.isDeprecated) {
    const target = new Date(client.stageEnteredAt);
    target.setDate(target.getDate() + stage.slaDays);

    milestones.push({
      id: `${client.id}-stage-target`,
      clientId: client.id,
      companyName: client.companyName,
      name: stage.name,
      source: "stage-target",
      dueAt: target.toISOString(),
      completed: false,
    });
  }

  const history: JourneyHistoryEntry[] = client.stageHistory.map((entry) => ({
    id: entry.id,
    fromStageName: entry.fromStage?.name ?? null,
    toStageName: entry.toStage.name,
    changedByName: entry.changedBy?.name ?? null,
    changedAt: entry.changedAt.toISOString(),
    note: entry.note,
    wasOverridden: entry.wasOverridden,
    overrideReason: entry.overrideReason,
  }));

  const scheduledLaunch = client.launches
    .filter((launch) => launch.scheduledFor && !launch.completedAt)
    .sort(
      (a, b) =>
        (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0),
    )[0];

  const projectLaunch = client.projects
    .filter((project) => project.targetLaunchDate)
    .sort(
      (a, b) =>
        (a.targetLaunchDate?.getTime() ?? 0) - (b.targetLaunchDate?.getTime() ?? 0),
    )[0];

  /*
   * Only an actual project manager, never a stand-in.
   *
   * This used to fall back to the account owner when no project had a manager,
   * on the reasoning that a name beats an empty cell. It does not: it labelled
   * a sales rep "Project Manager" on the board and the client page, and it
   * disagreed with the stage gate, which checks projectManagerId and was
   * correctly reporting the same account as unmanaged. A page that answers
   * "who owns this" with the wrong person is worse than one that admits
   * nobody does - and "Not assigned" is what prompts somebody to fix it.
   *
   * The account owner is still available as ownerName for anywhere that wants
   * it.
   */
  const projectManagerName =
    client.projects.find((project) => project.projectManager?.name)?.projectManager
      ?.name
    ?? null;

  const services = Array.from(
    new Set([
      ...client.projects.map((project) => project.serviceType as string),
      client.serviceType as string,
    ]),
  );

  return {
    id: client.id,
    companyName: client.companyName,
    clientName: client.clientName,
    status: client.status,
    storedHealth: client.healthStatus,
    serviceType: client.serviceType,
    services,

    stageId: stage.id,
    stageName: stage.name,
    stageKey: stage.stageKey,
    stageColor: stage.color,
    stagePosition: stage.position,
    isStageDeprecated: stage.isDeprecated,
    stageEnteredAt: client.stageEnteredAt.toISOString(),
    stageTargetDays: stage.slaDays,

    ownerId: client.assignedUserId,
    ownerName: client.assignedUser?.name ?? null,
    projectManagerName,

    currentBlocker: client.currentBlocker,
    nextAction: client.nextAction,
    nextActionDueAt: iso(client.nextActionDueAt),
    lastClientUpdateAt: iso(client.lastClientUpdateAt),
    renewalDate: iso(client.renewalDate),
    contractEndDate: iso(client.contractEndDate),
    launchDate:
      iso(scheduledLaunch?.scheduledFor) ?? iso(projectLaunch?.targetLaunchDate),

    openTaskCount: openTasks.length,
    completedTaskCount: client.agencyTasks.filter((task) =>
      DONE_TASK_STATUSES.has(task.status),
    ).length,
    overdueTaskCount: openTasks.filter(
      (task) => task.dueDate !== null && task.dueDate < now,
    ).length,
    blockedTaskCount: openTasks.filter(
      (task) => task.status === EmployeeTaskStatus.BLOCKED,
    ).length,
    waitingTaskCount: openTasks.filter(
      (task) => task.status === EmployeeTaskStatus.WAITING_CLIENT,
    ).length,
    reviewTaskCount: openTasks.filter(
      (task) => task.status === EmployeeTaskStatus.NEEDS_REVIEW,
    ).length,
    inProgressTaskCount: openTasks.filter(
      (task) => task.status === EmployeeTaskStatus.IN_PROGRESS,
    ).length,
    criticalAccessMissing: client.accessRecords.filter(
      (record) => record.isCritical && !ACCESS_USABLE.has(record.status),
    ).length,
    openDefectCount: client.defects.filter(
      (defect) => !CLOSED_DEFECT_STATUSES.has(defect.status),
    ).length,
    awaitingReviewCount: client.reviewCycles.filter((cycle) =>
      AWAITING_CLIENT_REVIEW.has(cycle.status),
    ).length,
    intakeStatus: client.intakeForm?.status ?? null,
    strategyBriefStatus: client.strategyBrief?.status ?? null,
    satisfactionScore: client.healthAssessments[0]?.satisfactionScore ?? null,

    requirements: evaluate(stage.id),
    exitCriteria: evaluate(nextStage?.id ?? null),
    nextStageId: nextStage?.id ?? null,
    nextStageName: nextStage?.name ?? null,
    nextStageKey: nextStage?.stageKey ?? null,
    pausedDays: pausedDaysInStage(client.journeyFlags, client.stageEnteredAt, new Date()),

    milestones,
    history,
  };
}

export async function getJourneyWorkspaceData(
  actor: AuthContext,
): Promise<JourneyWorkspaceData> {
  const canMove = can(actor, "journey.move");
  const canOverride = can(actor, "journey.override");
  const seesEverything = can(actor, "clients.view.all");

  try {
    const [stages, clients] = await Promise.all([
      prisma.pipelineStage.findMany({
        // Retired stages are excluded. An account may still sit on one, and
        // carries its own stage details inline, but nothing should offer a
        // stage nobody is meant to use any more as a destination or a filter.
        where: { pipelineId: FULFILLMENT_PIPELINE_ID, isDeprecated: false },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          stageKey: true,
          color: true,
          position: true,
          slaDays: true,
          isTerminal: true,
          isDeprecated: true,
          requirements: {
            orderBy: { position: "asc" },
            select: { requirementKey: true, label: true, isBlocking: true },
          },
        },
      }),
      prisma.client.findMany({
        // A team member only ever sees the accounts assigned to them.
        where: {
          deletedAt: null,
          /* The board is work in progress; a filed account has none. */
          archivedAt: null,
          ...(seesEverything ? {} : { assignedUserId: actor.id }),
        },
        orderBy: { stageEnteredAt: "asc" },
        select: journeyAccountSelect,
      }),
    ]);

    const requirementsByStageId = new Map(
      stages.map((stage) => [stage.id, stage.requirements]),
    );

    // Already retired-free, so this is every stage an account may advance
    // into, in order.
    const liveStages = stages;

    const accounts = clients.map((client) =>
      buildJourneyAccount(client, requirementsByStageId, liveStages),
    );

    /*
     * The activity feed is client-level only.
     *
     * PIPELINE entries are stage moves and CLIENT entries are account changes.
     * EMPLOYEE_TASK is deliberately excluded: every status tick on every task
     * would bury the handful of things that actually matter here, and the task
     * detail already lives in My Work.
     */
    const activityRows = accounts.length
      ? await prisma.activityLog.findMany({
          where: {
            entityType: { in: ["PIPELINE", "CLIENT"] },
            entityId: { in: accounts.map((account) => account.id) },
          },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            action: true,
            entityId: true,
            createdAt: true,
            actor: { select: { name: true } },
          },
        })
      : [];

    const companyById = new Map(
      accounts.map((account) => [account.id, account.companyName]),
    );

    const activity = activityRows.map<JourneyActivityEntry>((row) => ({
      id: row.id,
      clientId: row.entityId,
      companyName: companyById.get(row.entityId) ?? null,
      action: row.action,
      actorName: row.actor?.name ?? null,
      createdAt: row.createdAt.toISOString(),
      kind: activityKind(row.action),
    }));

    const owners = Array.from(
      new Map(
        accounts
          .filter((account) => account.ownerId && account.ownerName)
          .map((account) => [
            account.ownerId as string,
            { id: account.ownerId as string, name: account.ownerName as string },
          ]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name));

    const services = Array.from(
      new Set(accounts.flatMap((account) => account.services)),
    ).sort();

    return {
      accounts,
      stages: stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        stageKey: stage.stageKey,
        color: stage.color,
        position: stage.position,
        slaDays: stage.slaDays,
        isTerminal: stage.isTerminal,
        isDeprecated: stage.isDeprecated,
        requirementCount: stage.requirements.length,
      })),
      owners,
      services,
      activity,
      canMove,
      canOverride,
      isDegraded: false,
    };
  } catch (error) {
    console.error("[journey-queries] Failed to load the journey workspace.", error);
    return { ...EMPTY, canMove, canOverride };
  }
}
