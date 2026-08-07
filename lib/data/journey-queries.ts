import { differenceInCalendarDays } from "date-fns";

import { FULFILLMENT_PIPELINE_ID } from "@/lib/workspace-defaults";
import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export interface JourneyStageOption {
  id: string;
  name: string;
  color: string;
  position: number;
  stageKey: string | null;
  slaDays: number | null;
  isTerminal: boolean;
  requirementCount: number;
}

export interface JourneyAccountRow {
  id: string;
  companyName: string;
  clientName: string;
  status: string;
  healthStatus: string;
  stageId: string;
  stageName: string;
  stageColor: string;
  stagePosition: number;
  stageEnteredAt: Date;
  daysInStage: number;
  slaDays: number | null;
  isOverSla: boolean;
  ownerName: string | null;
  currentBlocker: string | null;
  nextAction: string | null;
  nextActionDueAt: Date | null;
  isStageDeprecated: boolean;
}

export interface JourneyWorkspaceData {
  stages: JourneyStageOption[];
  accounts: JourneyAccountRow[];
  stageCounts: { stageId: string; stageName: string; color: string; count: number }[];
  canMove: boolean;
  canOverride: boolean;
  isDegraded: boolean;
}

const EMPTY: JourneyWorkspaceData = {
  stages: [],
  accounts: [],
  stageCounts: [],
  canMove: false,
  canOverride: false,
  isDegraded: true,
};

export async function getJourneyWorkspaceData(
  actor: AuthContext,
): Promise<JourneyWorkspaceData> {
  const canMove = can(actor, "journey.move");
  const canOverride = can(actor, "journey.override");
  const seesEverything = can(actor, "clients.view.all");

  try {
    const [stages, clients] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: { pipelineId: FULFILLMENT_PIPELINE_ID, isDeprecated: false },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          position: true,
          stageKey: true,
          slaDays: true,
          isTerminal: true,
          _count: { select: { requirements: true } },
        },
      }),
      prisma.client.findMany({
        // A team member only ever sees the accounts assigned to them.
        where: {
          deletedAt: null,
          ...(seesEverything ? {} : { assignedUserId: actor.id }),
        },
        orderBy: [{ stageEnteredAt: "asc" }],
        select: {
          id: true,
          companyName: true,
          clientName: true,
          status: true,
          healthStatus: true,
          stageEnteredAt: true,
          currentBlocker: true,
          nextAction: true,
          nextActionDueAt: true,
          assignedUser: { select: { name: true } },
          currentStage: {
            select: {
              id: true,
              name: true,
              color: true,
              position: true,
              slaDays: true,
              isDeprecated: true,
            },
          },
        },
      }),
    ]);

    const today = new Date();

    const accounts = clients.map<JourneyAccountRow>((client) => {
      const daysInStage = Math.max(
        0,
        differenceInCalendarDays(today, client.stageEnteredAt),
      );
      const slaDays = client.currentStage.slaDays;

      return {
        id: client.id,
        companyName: client.companyName,
        clientName: client.clientName,
        status: client.status,
        healthStatus: client.healthStatus,
        stageId: client.currentStage.id,
        stageName: client.currentStage.name,
        stageColor: client.currentStage.color,
        stagePosition: client.currentStage.position,
        stageEnteredAt: client.stageEnteredAt,
        daysInStage,
        slaDays,
        isOverSla: slaDays !== null && daysInStage > slaDays,
        ownerName: client.assignedUser?.name ?? null,
        currentBlocker: client.currentBlocker,
        nextAction: client.nextAction,
        nextActionDueAt: client.nextActionDueAt,
        isStageDeprecated: client.currentStage.isDeprecated,
      };
    });

    return {
      stages: stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        position: stage.position,
        stageKey: stage.stageKey,
        slaDays: stage.slaDays,
        isTerminal: stage.isTerminal,
        requirementCount: stage._count.requirements,
      })),
      accounts,
      stageCounts: stages.map((stage) => ({
        stageId: stage.id,
        stageName: stage.name,
        color: stage.color,
        count: accounts.filter((account) => account.stageId === stage.id).length,
      })),
      canMove,
      canOverride,
      isDegraded: false,
    };
  } catch (error) {
    console.error("[journey-queries] Failed to load journey workspace.", error);
    return { ...EMPTY, canMove, canOverride };
  }
}
