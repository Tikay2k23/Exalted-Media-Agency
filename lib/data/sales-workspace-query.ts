import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { leadVisibilityWhere } from "@/lib/sales/lead-service";
import type { SalesLead } from "@/lib/sales/sales-view";
import { SALES_PIPELINE_ID } from "@/lib/workspace-defaults";

/**
 * The whole sales workspace, in one read.
 *
 * Every figure on the page is derived in the browser from these rows, so the
 * metric strip, the Needs Action cards, the pipeline counts and the table
 * cannot disagree with each other. Sending counts computed separately would
 * eventually produce a card that says three above a list of two.
 *
 * Scoped by the same visibility rule the rest of the sales code uses: a rep
 * sees their own book, whoever runs sales sees all of it.
 */

export interface SalesStage {
  id: string;
  name: string;
  color: string;
  position: number;
  stageKey: string | null;
  isTerminal: boolean;
  slaDays: number | null;
}

export interface SalesWorkspace {
  stages: SalesStage[];
  leads: SalesLead[];
  owners: { id: string; name: string }[];
  sources: string[];
  /** How long a proposal may sit, read from the stage's own SLA. */
  proposalAgingDays: number | null;
  canCreate: boolean;
  canEdit: boolean;
  canConvert: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canSeeTeam: boolean;
  hasAccess: boolean;
}

const EMPTY: Omit<SalesWorkspace, "canCreate" | "canEdit" | "canConvert" | "canDelete" | "canAssign" | "canSeeTeam"> = {
  stages: [],
  leads: [],
  owners: [],
  sources: [],
  proposalAgingDays: null,
  hasAccess: false,
};

export async function getSalesWorkspace(actor: AuthContext): Promise<SalesWorkspace> {
  const permissions = {
    canCreate: can(actor, "leads.create"),
    canEdit: can(actor, "leads.edit"),
    canConvert: can(actor, "leads.convert"),
    canDelete: can(actor, "leads.delete"),
    canAssign: can(actor, "leads.view.all"),
    // Team performance is somebody else's numbers. Only the seats that manage
    // sales see it.
    canSeeTeam: can(actor, "leads.view.all") || can(actor, "sales.reporting"),
  };

  const visibility = leadVisibilityWhere(actor);

  if (!visibility) {
    return { ...EMPTY, ...permissions };
  }

  const [stages, leads, owners] = await Promise.all([
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
        slaDays: true,
      },
    }),
    prisma.lead.findMany({
      where: { ...visibility, deletedAt: null },
      orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "desc" }],
      take: 1000,
      select: {
        id: true,
        contactName: true,
        businessName: true,
        email: true,
        phone: true,
        source: true,
        status: true,
        nextAction: true,
        nextFollowUpAt: true,
        lastContactAt: true,
        strategyCallAt: true,
        strategyCallStatus: true,
        proposalSentAt: true,
        wonAt: true,
        lostAt: true,
        lostReasonCode: true,
        nurtureUntil: true,
        budgetAmount: true,
        proposalValue: true,
        finalValue: true,
        convertedClientId: true,
        notes: true,
        createdAt: true,
        stage: { select: { id: true, name: true, stageKey: true } },
        assignedTo: { select: { id: true, name: true } },
        wonBy: { select: { name: true } },
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

  /*
   * Decimal never survives the trip to a client component - it is the exact bug
   * that broke the pipeline page once already - so money is converted to a
   * number here rather than anywhere downstream.
   */
  const rows: SalesLead[] = leads.map((lead) => ({
    id: lead.id,
    contactName: lead.contactName,
    businessName: lead.businessName,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    stageId: lead.stage?.id ?? null,
    stageKey: lead.stage?.stageKey ?? null,
    stageName: lead.stage?.name ?? null,
    ownerId: lead.assignedTo?.id ?? null,
    ownerName: lead.assignedTo?.name ?? null,
    nextAction: lead.nextAction,
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    lastContactAt: lead.lastContactAt?.toISOString() ?? null,
    strategyCallAt: lead.strategyCallAt?.toISOString() ?? null,
    strategyCallStatus: lead.strategyCallStatus,
    proposalSentAt: lead.proposalSentAt?.toISOString() ?? null,
    wonAt: lead.wonAt?.toISOString() ?? null,
    wonByName: lead.wonBy?.name ?? null,
    lostAt: lead.lostAt?.toISOString() ?? null,
    lostReasonCode: lead.lostReasonCode,
    nurtureUntil: lead.nurtureUntil?.toISOString() ?? null,
    budgetAmount: lead.budgetAmount === null ? null : Number(lead.budgetAmount),
    proposalValue: lead.proposalValue === null ? null : Number(lead.proposalValue),
    finalValue: lead.finalValue === null ? null : Number(lead.finalValue),
    convertedClientId: lead.convertedClientId,
    notes: lead.notes,
    createdAt: lead.createdAt.toISOString(),
  }));

  // The aging threshold comes from the proposal stage's own SLA rather than a
  // constant, so changing it is a workspace setting rather than a deploy.
  const proposalStage = stages.find((stage) => stage.stageKey === "proposal_sent");

  return {
    stages,
    leads: rows,
    owners,
    // Only the sources that actually appear, so the filter never offers an
    // option that matches nothing.
    sources: [...new Set(rows.map((lead) => lead.source))].sort(),
    proposalAgingDays: proposalStage?.slaDays ?? null,
    hasAccess: true,
    ...permissions,
  };
}
