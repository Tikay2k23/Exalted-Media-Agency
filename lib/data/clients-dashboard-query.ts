import { AccessStatus, EmployeeTaskStatus, ReviewStatus } from "@prisma/client";

import { type AuthContext } from "@/lib/authz";
import type { ClientMilestone, ClientRow } from "@/lib/clients/client-workspace";
import { can, canManageClients, canViewAllAgencyData } from "@/lib/permissions";
import { CLOSED_DEFECT_STATUSES } from "@/lib/quality/defect-service";
import { prisma } from "@/lib/prisma";

/**
 * The whole clients dashboard, in one read.
 *
 * Every figure on the page is derived in the browser from these rows, so the
 * summary cards, the quick filter chips, the attention list and the directory
 * cannot disagree with each other. Sending counts computed separately would
 * eventually produce a card that says four above a list of three.
 *
 * Scoped by the same visibility rule the rest of the client code uses: a
 * specialist sees the accounts assigned to them, whoever runs delivery sees the
 * whole book.
 */

/** Task statuses that still need somebody to do something. */
const OPEN_TASK_STATUSES: EmployeeTaskStatus[] = [
  EmployeeTaskStatus.BACKLOG,
  EmployeeTaskStatus.TODO,
  EmployeeTaskStatus.IN_PROGRESS,
  EmployeeTaskStatus.WAITING_CLIENT,
  EmployeeTaskStatus.BLOCKED,
  EmployeeTaskStatus.NEEDS_REVIEW,
  EmployeeTaskStatus.REVISION_REQUIRED,
];

/**
 * Access states that mean the agency still cannot get in.
 *
 * GRANTED, TESTED and NOT_APPLICABLE are the only ones that are fine, so this
 * is written as everything else - a new state added to the enum then counts as
 * a problem until somebody decides otherwise, which is the safe default.
 */
const ACCESS_USABLE = [AccessStatus.GRANTED, AccessStatus.TESTED, AccessStatus.NOT_APPLICABLE];

/** Review rounds sitting with the client rather than with the agency. */
const AWAITING_CLIENT_REVIEW = [ReviewStatus.SENT, ReviewStatus.AWAITING_FEEDBACK];

export interface ClientStageOption {
  id: string;
  name: string;
  stageKey: string | null;
  position: number;
}

export interface ClientsDashboard {
  clients: ClientRow[];
  stages: ClientStageOption[];
  owners: { id: string; name: string; teamRole: string }[];
  services: string[];
  canCreate: boolean;
  canManage: boolean;
  canSeeFinance: boolean;
  hasAccess: boolean;
}

const EMPTY: Omit<ClientsDashboard, "canCreate" | "canManage" | "canSeeFinance"> = {
  clients: [],
  stages: [],
  owners: [],
  services: [],
  hasAccess: false,
};

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

/**
 * One account, through the same select and the same mapper the dashboard uses.
 *
 * The Overview tab needs exactly the derived row the directory row shows -
 * attention reasons, milestones, waiting state - and computing them a second
 * way is how a client comes to look fine on one page and wrong on the other.
 */
export async function getClientRow(
  actor: AuthContext,
  clientId: string,
): Promise<ClientRow | null> {
  const dashboard = await getClientsDashboard(actor, clientId);

  return dashboard.clients[0] ?? null;
}

export async function getClientsDashboard(
  actor: AuthContext,
  /** Narrow to one account. Visibility is applied either way. */
  clientId?: string,
): Promise<ClientsDashboard> {
  const permissions = {
    canCreate: canManageClients(actor.role),
    canManage: canManageClients(actor.role),
    canSeeFinance: can(actor, "finance.view"),
  };

  if (!can(actor, "clients.view.all") && !can(actor, "clients.view.assigned")) {
    return { ...EMPTY, ...permissions };
  }

  const scope = canViewAllAgencyData(actor.role) ? {} : { assignedUserId: actor.id };
  const now = new Date();

  const [clients, stages, owners] = await Promise.all([
    prisma.client.findMany({
      /*
       * Archived accounts leave the directory. Asking for one by id still
       * returns it, so a link into a filed client keeps working.
       */
      where: {
        ...scope,
        deletedAt: null,
        ...(clientId ? { id: clientId } : { archivedAt: null }),
      },
      orderBy: [{ companyName: "asc" }],
      take: clientId ? 1 : 500,
      select: {
        id: true,
        companyName: true,
        clientName: true,
        contactEmail: true,
        contactPhone: true,
        status: true,
        healthStatus: true,
        serviceType: true,
        monthlyValue: true,
        contractStartDate: true,
        contractEndDate: true,
        renewalDate: true,
        currentBlocker: true,
        nextAction: true,
        nextActionDueAt: true,
        lastClientUpdateAt: true,
        dateAdded: true,
        updatedAt: true,
        currentStage: { select: { id: true, name: true, stageKey: true } },
        assignedUser: { select: { id: true, name: true } },
        intakeForm: { select: { status: true } },

        /*
         * Counted in the same read rather than fetched per card. Each of these
         * feeds an attention reason, and an attention reason with no record
         * behind it would be the interface inventing a problem.
         */
        agencyTasks: {
          where: { deletedAt: null, status: { in: OPEN_TASK_STATUSES } },
          select: { id: true, status: true, dueDate: true },
        },
        accessRecords: {
          where: { isCritical: true, status: { notIn: ACCESS_USABLE } },
          select: { id: true },
        },
        defects: {
          // Filtered by the same list isDefectOpen uses, imported rather than
          // repeated - a second copy would drift the first time one changed.
          where: { status: { notIn: CLOSED_DEFECT_STATUSES } },
          select: { id: true },
        },
        reviewCycles: {
          where: { status: { in: AWAITING_CLIENT_REVIEW } },
          select: { id: true, feedbackDeadline: true, roundNumber: true },
        },
        reports: {
          where: { dueAt: { not: null } },
          orderBy: { dueAt: "asc" },
          select: { id: true, type: true, status: true, dueAt: true, sentAt: true },
        },

        /*
         * The services an account actually has. Client.serviceType is one enum,
         * but a project per service is how the agency already models "CRM this
         * quarter, advertising as well" - so this reads projects rather than
         * adding a second service table beside them.
         */
        projects: {
          where: { deletedAt: null },
          select: {
            id: true,
            serviceType: true,
            status: true,
            milestones: {
              where: { completedAt: null, dueDate: { not: null } },
              select: { id: true, name: true, dueDate: true },
            },
          },
        },
        launches: {
          where: { completedAt: null, scheduledFor: { not: null } },
          select: { id: true, name: true, scheduledFor: true, status: true },
        },
        renewals: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, renewalDate: true, stage: true },
        },
      },
    }),
    prisma.pipelineStage.findMany({
      where: { pipeline: { kind: "FULFILLMENT" }, isDeprecated: false },
      orderBy: { position: "asc" },
      select: { id: true, name: true, stageKey: true, position: true },
    }),
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, teamRole: true },
    }),
  ]);

  /*
   * The last thing that happened on each account, read from the activity log
   * the whole application already writes to. One grouped query rather than one
   * per client.
   */
  const activity = clients.length
    ? await prisma.activityLog.findMany({
        where: { entityType: "CLIENT", entityId: { in: clients.map((client) => client.id) } },
        orderBy: { createdAt: "desc" },
        /*
         * One row per client, chosen by the database. Taking the newest few
         * hundred and picking the first per client looks equivalent and is not:
         * a quiet account whose last activity falls outside that window gets no
         * row at all and silently falls back to updatedAt, which then reads as
         * recent activity that never happened.
         */
        distinct: ["entityId"],
        select: { entityId: true, action: true, createdAt: true },
      })
    : [];

  const lastActivity = new Map<string, { action: string; createdAt: Date }>();

  for (const entry of activity) {
    if (!entry.entityId || lastActivity.has(entry.entityId)) continue;
    lastActivity.set(entry.entityId, { action: entry.action, createdAt: entry.createdAt });
  }

  const rows: ClientRow[] = clients.map((client) => {
    const overdue = client.agencyTasks.filter((task) => task.dueDate < now).length;
    const waiting = client.agencyTasks.filter(
      (task) => task.status === EmployeeTaskStatus.WAITING_CLIENT,
    ).length;

    const overdueReports = client.reports.filter(
      (report) =>
        report.dueAt !== null
        && !report.sentAt
        && report.status !== "ACKNOWLEDGED"
        && report.dueAt < now,
    ).length;

    const seen = lastActivity.get(client.id);

    /*
     * Milestones are not a table. They are every dated commitment the agency
     * has already made on this account, read together so one calendar is
     * possible without a second system to keep in step.
     */
    const milestones: ClientMilestone[] = [
      ...client.projects.flatMap((project) =>
        project.milestones.map((milestone) => ({
          id: milestone.id,
          clientId: client.id,
          clientName: client.companyName,
          name: milestone.name,
          source: "project-milestone" as const,
          dueAt: milestone.dueDate!.toISOString(),
          hasTime: false,
          tab: "tasks" as const,
          status: project.status,
        })),
      ),
      ...client.launches.map((launch) => ({
        id: launch.id,
        clientId: client.id,
        clientName: client.companyName,
        name: launch.name,
        source: "launch" as const,
        dueAt: launch.scheduledFor!.toISOString(),
        hasTime: true,
        tab: "quality" as const,
        status: launch.status,
      })),
      ...client.reports
        .filter((report) => report.dueAt && !report.sentAt)
        .map((report) => ({
          id: report.id,
          clientId: client.id,
          clientName: client.companyName,
          name: `${report.type
            .toLowerCase()
            .split("_")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ")} Report`,
          source: "report" as const,
          dueAt: report.dueAt!.toISOString(),
          hasTime: false,
          tab: "reports" as const,
          status: report.status,
        })),
      ...client.reviewCycles
        .filter((review) => review.feedbackDeadline)
        .map((review) => ({
          id: review.id,
          clientId: client.id,
          clientName: client.companyName,
          name: `Client Review (round ${review.roundNumber})`,
          source: "review" as const,
          dueAt: review.feedbackDeadline!.toISOString(),
          hasTime: false,
          tab: "quality" as const,
          status: null,
        })),
      ...(client.renewals[0]?.renewalDate
        ? [
            {
              id: client.renewals[0].id,
              clientId: client.id,
              clientName: client.companyName,
              name: "Renewal",
              source: "renewal" as const,
              dueAt: client.renewals[0].renewalDate.toISOString(),
              hasTime: false,
              tab: "reports" as const,
              status: client.renewals[0].stage,
            },
          ]
        : client.renewalDate
          ? [
              {
                id: `${client.id}-renewal`,
                clientId: client.id,
                clientName: client.companyName,
                name: "Renewal",
                source: "renewal" as const,
                dueAt: client.renewalDate.toISOString(),
                hasTime: false,
                tab: "reports" as const,
                status: null,
              },
            ]
          : []),
      ...(client.contractEndDate
        ? [
            {
              id: `${client.id}-contract-end`,
              clientId: client.id,
              clientName: client.companyName,
              name: "Contract Ends",
              source: "contract-end" as const,
              dueAt: client.contractEndDate.toISOString(),
              hasTime: false,
              tab: "contacts" as const,
              status: null,
            },
          ]
        : []),
      ...(client.nextActionDueAt && client.nextAction?.trim()
        ? [
            {
              id: `${client.id}-next-action`,
              clientId: client.id,
              clientName: client.companyName,
              name: client.nextAction.trim(),
              source: "next-action" as const,
              dueAt: client.nextActionDueAt.toISOString(),
              hasTime: false,
              tab: "overview" as const,
              status: null,
            },
          ]
        : []),
    ];

    return {
      id: client.id,
      companyName: client.companyName,
      clientName: client.clientName,
      contactEmail: client.contactEmail,
      contactPhone: client.contactPhone,
      status: client.status,
      healthStatus: client.healthStatus,
      stageId: client.currentStage?.id ?? "",
      stageName: client.currentStage?.name ?? "No stage",
      stageKey: client.currentStage?.stageKey ?? null,
      ownerId: client.assignedUser?.id ?? null,
      ownerName: client.assignedUser?.name ?? null,
      serviceType: client.serviceType,
      services: [...new Set(client.projects.map((project) => project.serviceType))],
      // Decimal never survives the trip to a client component.
      monthlyValue: client.monthlyValue === null ? null : Number(client.monthlyValue),
      contractStartDate: iso(client.contractStartDate),
      contractEndDate: iso(client.contractEndDate),
      renewalDate: iso(client.renewals[0]?.renewalDate ?? client.renewalDate),
      currentBlocker: client.currentBlocker,
      nextAction: client.nextAction,
      nextActionDueAt: iso(client.nextActionDueAt),
      lastClientUpdateAt: iso(client.lastClientUpdateAt),
      dateAdded: client.dateAdded.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
      openTaskCount: client.agencyTasks.length,
      overdueTaskCount: overdue,
      waitingTaskCount: waiting,
      criticalAccessMissing: client.accessRecords.length,
      intakeStatus: client.intakeForm?.status ?? null,
      openDefectCount: client.defects.length,
      awaitingReviewCount: client.reviewCycles.length,
      overdueReportCount: overdueReports,
      lastActivityAt: seen ? seen.createdAt.toISOString() : null,
      lastActivityLabel: seen?.action ?? null,
      milestones,
    };
  });

  return {
    clients: rows,
    stages,
    owners,
    // Only the services that actually appear, so a filter never offers an
    // option that matches nothing.
    services: [
      ...new Set(rows.flatMap((row) => (row.services.length ? row.services : [row.serviceType]))),
    ].sort(),
    hasAccess: true,
    ...permissions,
  };
}
