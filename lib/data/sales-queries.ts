import { LeadStatus } from "@prisma/client";
import { startOfMonth, subDays } from "date-fns";

import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { leadVisibilityWhere } from "@/lib/sales/lead-service";
import { SALES_PIPELINE_ID } from "@/lib/workspace-defaults";

export interface SalesStageOption {
  id: string;
  name: string;
  color: string;
  position: number;
  stageKey: string | null;
  isTerminal: boolean;
}

export interface LeadRow {
  id: string;
  contactName: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  score: number | null;
  budgetAmount: number | null;
  proposalValue: number | null;
  stageId: string | null;
  stageName: string | null;
  stageColor: string | null;
  ownerId: string | null;
  ownerName: string | null;
  nextFollowUpAt: Date | null;
  isFollowUpOverdue: boolean;
  lastCallAt: Date | null;
  callCount: number;
  convertedClientId: string | null;
  createdAt: Date;
}

export interface SalesWorkspaceData {
  stages: SalesStageOption[];
  leads: LeadRow[];
  assignableUsers: { id: string; name: string }[];
  metrics: {
    openLeads: number;
    newThisWeek: number;
    qualified: number;
    callsBooked: number;
    proposalsPending: number;
    wonThisMonth: number;
    lostThisMonth: number;
    overdueFollowUps: number;
    unassigned: number;
    openPipelineValue: number;
  };
  canCreate: boolean;
  canEdit: boolean;
  canConvert: boolean;
  canDelete: boolean;
  canAssign: boolean;
  hasAccess: boolean;
  isDegraded: boolean;
}

const OPEN_STATUSES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.ATTEMPTING_CONTACT,
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
  LeadStatus.NURTURE,
];

export async function getSalesWorkspaceData(
  actor: AuthContext,
): Promise<SalesWorkspaceData> {
  const permissions = {
    canCreate: can(actor, "leads.create"),
    canEdit: can(actor, "leads.edit"),
    canConvert: can(actor, "leads.convert"),
    canDelete: can(actor, "leads.delete"),
    canAssign: can(actor, "leads.view.all"),
  };

  const visibility = leadVisibilityWhere(actor);

  const empty: SalesWorkspaceData = {
    stages: [],
    leads: [],
    assignableUsers: [],
    metrics: {
      openLeads: 0,
      newThisWeek: 0,
      qualified: 0,
      callsBooked: 0,
      proposalsPending: 0,
      wonThisMonth: 0,
      lostThisMonth: 0,
      overdueFollowUps: 0,
      unassigned: 0,
      openPipelineValue: 0,
    },
    ...permissions,
    hasAccess: visibility !== null,
    isDegraded: false,
  };

  if (!visibility) {
    return empty;
  }

  try {
    const [stages, leads, assignableUsers] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: { pipelineId: SALES_PIPELINE_ID, isDeprecated: false },
        orderBy: { position: "asc" },
        select: {
          id: true,
          name: true,
          color: true,
          position: true,
          stageKey: true,
          isTerminal: true,
        },
      }),
      prisma.lead.findMany({
        where: visibility,
        orderBy: [{ nextFollowUpAt: "asc" }, { score: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          contactName: true,
          businessName: true,
          email: true,
          phone: true,
          source: true,
          status: true,
          score: true,
          budgetAmount: true,
          proposalValue: true,
          nextFollowUpAt: true,
          convertedClientId: true,
          createdAt: true,
          stage: { select: { id: true, name: true, color: true } },
          assignedTo: { select: { id: true, name: true } },
          callLogs: {
            orderBy: { occurredAt: "desc" },
            take: 1,
            select: { occurredAt: true },
          },
          _count: { select: { callLogs: true } },
        },
      }),
      permissions.canAssign
        ? prisma.user.findMany({
            where: { isActive: true, deletedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const now = new Date();
    const weekAgo = subDays(now, 7);
    const monthStart = startOfMonth(now);

    const rows = leads.map<LeadRow>((lead) => ({
      id: lead.id,
      contactName: lead.contactName,
      businessName: lead.businessName,
      email: lead.email,
      phone: lead.phone,
      source: lead.source,
      status: lead.status,
      score: lead.score,
      budgetAmount: lead.budgetAmount === null ? null : Number(lead.budgetAmount),
      proposalValue: lead.proposalValue === null ? null : Number(lead.proposalValue),
      stageId: lead.stage?.id ?? null,
      stageName: lead.stage?.name ?? null,
      stageColor: lead.stage?.color ?? null,
      ownerId: lead.assignedTo?.id ?? null,
      ownerName: lead.assignedTo?.name ?? null,
      nextFollowUpAt: lead.nextFollowUpAt,
      isFollowUpOverdue: Boolean(
        lead.nextFollowUpAt
          && lead.nextFollowUpAt < now
          && OPEN_STATUSES.includes(lead.status),
      ),
      lastCallAt: lead.callLogs[0]?.occurredAt ?? null,
      callCount: lead._count.callLogs,
      convertedClientId: lead.convertedClientId,
      createdAt: lead.createdAt,
    }));

    const openLeads = rows.filter((lead) =>
      OPEN_STATUSES.includes(lead.status as LeadStatus),
    );

    return {
      stages,
      leads: rows,
      assignableUsers,
      metrics: {
        openLeads: openLeads.length,
        newThisWeek: rows.filter((lead) => lead.createdAt >= weekAgo).length,
        qualified: rows.filter((lead) => lead.status === LeadStatus.QUALIFIED).length,
        callsBooked: rows.filter(
          (lead) =>
            lead.stageName === "Strategy Call Booked"
            || lead.stageName === "Strategy Call Showed",
        ).length,
        proposalsPending: rows.filter(
          (lead) => lead.stageName === "Proposal Sent" || lead.stageName === "Negotiation",
        ).length,
        wonThisMonth: rows.filter(
          (lead) => lead.status === LeadStatus.CONVERTED && lead.createdAt >= monthStart,
        ).length,
        lostThisMonth: rows.filter(
          (lead) => lead.status === LeadStatus.LOST && lead.createdAt >= monthStart,
        ).length,
        overdueFollowUps: rows.filter((lead) => lead.isFollowUpOverdue).length,
        unassigned: rows.filter((lead) => !lead.ownerId).length,
        // Proposal value is the committed number; budget is the estimate before
        // one exists. Mixing them would inflate the figure.
        openPipelineValue: openLeads.reduce(
          (total, lead) => total + (lead.proposalValue ?? lead.budgetAmount ?? 0),
          0,
        ),
      },
      ...permissions,
      hasAccess: true,
      isDegraded: false,
    };
  } catch (error) {
    console.error("[sales-queries] Failed to load sales workspace.", error);
    return { ...empty, isDegraded: true };
  }
}
