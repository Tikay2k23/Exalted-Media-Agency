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
  /** Every tag and campaign in use, so a filter never offers an empty option. */
  tags: string[];
  campaigns: string[];
  /** How long a proposal may sit, read from the stage's own SLA. */
  proposalAgingDays: number | null;
  canCreate: boolean;
  canEdit: boolean;
  canConvert: boolean;
  /** Declaring that money arrived, which is what opens the delivery gates. */
  canConfirmPayment: boolean;
  /** Re-running a handoff that stopped part way. */
  canRetryHandoff: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canSeeTeam: boolean;
  hasAccess: boolean;
}

const EMPTY: Omit<
  SalesWorkspace,
  | "canCreate"
  | "canEdit"
  | "canConvert"
  | "canDelete"
  | "canAssign"
  | "canSeeTeam"
  | "canConfirmPayment"
  | "canRetryHandoff"
> = {
  stages: [],
  leads: [],
  owners: [],
  sources: [],
  tags: [],
  campaigns: [],
  proposalAgingDays: null,
  hasAccess: false,
};

export async function getSalesWorkspace(actor: AuthContext): Promise<SalesWorkspace> {
  const permissions = {
    canCreate: can(actor, "leads.create"),
    canEdit: can(actor, "leads.edit"),
    canConvert: can(actor, "leads.convert"),
    canConfirmPayment: can(actor, "finance.edit"),
    canRetryHandoff: can(actor, "clients.create") || can(actor, "finance.edit"),
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
        contactId: true,
        contactName: true,
        businessName: true,
        opportunityName: true,
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
        expectedCloseAt: true,
        opportunityValue: true,
        budgetAmount: true,
        budgetRange: true,
        proposalValue: true,
        finalValue: true,
        convertedClientId: true,
        handoff: { select: { state: true, clientId: true } },
        serviceInterest: true,
        campaign: true,
        timeline: true,
        isDecisionMaker: true,
        mainProblem: true,
        goal: true,
        currentSolution: true,
        qualificationNotes: true,
        score: true,
        tags: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        stage: { select: { id: true, name: true, stageKey: true } },
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        wonBy: { select: { name: true } },
        followers: { select: { user: { select: { name: true } } } },
        /*
         * Counted in the same query rather than fetched per card. The board
         * lights an activity icon only when its count is real - an icon that is
         * always on is decoration, and one that lies about a call having been
         * logged is worse than no icon.
         *
         * Files have no store yet, so that icon stays dark rather than being
         * given an invented number.
         */
        _count: {
          select: {
            callLogs: true,
            leadNotes: true,
            tasks: { where: { deletedAt: null } },
          },
        },
      },
    }),
    /*
     * The team, always - not only for the seats that may reassign. The owner
     * filter, the follower picker and the owner avatars all need names, and a
     * rep who cannot reassign still has to be able to read who holds what.
     * Changing an owner is gated by canAssign in the service, not by hiding
     * the list.
     */
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  /*
   * Decimal never survives the trip to a client component - it is the exact bug
   * that broke the pipeline page once already - so money is converted to a
   * number here rather than anywhere downstream.
   */
  const rows: SalesLead[] = leads.map((lead) => ({
    id: lead.id,
    contactId: lead.contactId,
    contactName: lead.contactName,
    businessName: lead.businessName,
    opportunityName: lead.opportunityName,
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
    expectedCloseAt: lead.expectedCloseAt?.toISOString() ?? null,
    opportunityValue: lead.opportunityValue === null ? null : Number(lead.opportunityValue),
    budgetAmount: lead.budgetAmount === null ? null : Number(lead.budgetAmount),
    budgetRange: lead.budgetRange,
    proposalValue: lead.proposalValue === null ? null : Number(lead.proposalValue),
    finalValue: lead.finalValue === null ? null : Number(lead.finalValue),
    convertedClientId: lead.convertedClientId,
    handoffState: lead.handoff?.state ?? null,
    handoffClientId: lead.handoff?.clientId ?? null,
    serviceInterest: lead.serviceInterest,
    campaign: lead.campaign,
    timeline: lead.timeline,
    isDecisionMaker: lead.isDecisionMaker,
    mainProblem: lead.mainProblem,
    goal: lead.goal,
    currentSolution: lead.currentSolution,
    qualificationNotes: lead.qualificationNotes,
    score: lead.score,
    tags: lead.tags,
    notes: lead.notes,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    createdByName: lead.createdBy?.name ?? null,
    followerNames: lead.followers.map((follower) => follower.user.name),
    activity: {
      calls: lead._count.callLogs,
      notes: lead._count.leadNotes,
      tasks: lead._count.tasks,
      // The strategy call is the only appointment this pipeline books, so this
      // is one or nothing rather than a number pulled from a calendar the
      // agency does not have yet.
      appointments: lead.strategyCallAt ? 1 : 0,
      files: 0,
    },
  }));

  // The aging threshold comes from the proposal stage's own SLA rather than a
  // constant, so changing it is a workspace setting rather than a deploy.
  const proposalStage = stages.find((stage) => stage.stageKey === "proposal_sent");

  return {
    stages,
    leads: rows,
    owners,
    // Only the values that actually appear, so a filter never offers an option
    // that matches nothing.
    sources: [...new Set(rows.map((lead) => lead.source))].sort(),
    tags: [...new Set(rows.flatMap((lead) => lead.tags))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    ),
    campaigns: [...new Set(rows.map((lead) => lead.campaign).filter(Boolean))].sort() as string[],
    proposalAgingDays: proposalStage?.slaDays ?? null,
    hasAccess: true,
    ...permissions,
  };
}
