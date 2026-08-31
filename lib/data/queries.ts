import {
  type ClientStatus,
  type Department,
  type EmployeeTask,
  EmployeeTaskStatus,
  Prisma,
  Role,
  ServiceType,
} from "@prisma/client";
import {
  eachDayOfInterval,
  endOfDay,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns";

import { canManageEmployeeTasks, canViewAllAgencyData } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { FULFILLMENT_PIPELINE_ID } from "@/lib/workspace-defaults";

export interface AppUser {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
}

export interface ClientFilters {
  search?: string;
  status?: ClientStatus | "ALL";
  assigneeId?: string | "ALL";
}

export interface WeeklyTaskTrackerFilters {
  weekStart?: string;
  date?: string;
  clientId?: string | "ALL";
  search?: string;
}

function getClientVisibilityWhere(user: AppUser): Prisma.ClientWhereInput {
  if (canViewAllAgencyData(user.role)) {
    return {};
  }

  return {
    assignedUserId: user.id,
  };
}

function getEmployeeTaskVisibilityWhere(user: AppUser): Prisma.EmployeeTaskWhereInput {
  if (canViewAllAgencyData(user.role)) {
    return {};
  }

  return {
    assignedToId: user.id,
  };
}

function parseDateInput(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = parseISO(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function getSelectedWeekRange(filters?: WeeklyTaskTrackerFilters) {
  const selectedDate = parseDateInput(filters?.date);
  const explicitWeekStart = parseDateInput(filters?.weekStart);
  const anchorDate = explicitWeekStart ?? selectedDate ?? new Date();
  const weekStart = startOfDay(startOfWeek(anchorDate, { weekStartsOn: 1 }));
  const weekEnd = endOfDay(endOfWeek(anchorDate, { weekStartsOn: 1 }));

  return {
    selectedDate,
    weekStart,
    weekEnd,
  };
}

function buildWeeklyTaskSearchWhere(search: string): Prisma.EmployeeTaskWhereInput {
  return {
    OR: [
      { title: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
      {
        assignedTo: {
          is: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { jobTitle: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
      {
        client: {
          is: {
            OR: [
              { companyName: { contains: search, mode: "insensitive" } },
              { clientName: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      },
      {
        eodEntries: {
          some: {
            OR: [
              { summary: { contains: search, mode: "insensitive" } },
              { blockers: { contains: search, mode: "insensitive" } },
              { nextSteps: { contains: search, mode: "insensitive" } },
              {
                author: {
                  is: {
                    OR: [
                      { name: { contains: search, mode: "insensitive" } },
                      { email: { contains: search, mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

function buildClientFilters(user: AppUser, filters?: ClientFilters): Prisma.ClientWhereInput {
  const clauses: Prisma.ClientWhereInput[] = [getClientVisibilityWhere(user)];

  if (filters?.search) {
    clauses.push({
      OR: [
        { clientName: { contains: filters.search, mode: "insensitive" } },
        { companyName: { contains: filters.search, mode: "insensitive" } },
        { contactEmail: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }

  if (filters?.status && filters.status !== "ALL") {
    clauses.push({ status: filters.status });
  }

  if (filters?.assigneeId && filters.assigneeId !== "ALL" && canViewAllAgencyData(user.role)) {
    clauses.push({ assignedUserId: filters.assigneeId });
  }

  return {
    AND: clauses,
  };
}

function countOpenAgencyTasks(tasks: Pick<EmployeeTask, "status">[]) {
  return tasks.filter((task) => task.status !== "DONE").length;
}

function countOverdueAgencyTasks(tasks: Pick<EmployeeTask, "status" | "dueDate">[]) {
  const today = new Date();
  return tasks.filter((task) => task.status !== "DONE" && task.dueDate < today).length;
}

function getOpenAgencyTaskHours(tasks: Pick<EmployeeTask, "status" | "estimatedHours">[]) {
  return tasks
    .filter((task) => task.status !== "DONE")
    .reduce((total, task) => total + task.estimatedHours, 0);
}

function getUtilizationRate(openHours: number, capacityHours: number) {
  if (!capacityHours) {
    return 0;
  }

  return Math.min(200, Math.round((openHours / capacityHours) * 100));
}

function getAttentionRank(client: { status: string; assignedUserId: string | null }) {
  if (client.status === "AT_RISK") {
    return 3;
  }

  if (client.status === "ON_HOLD") {
    return 2;
  }

  if (!client.assignedUserId) {
    return 1;
  }

  return 0;
}

export async function getSharedOptions() {
  try {
    const [stages, users] = await Promise.all([
      // Client forms must only offer client journey stages. Offering sales
      // stages here is what allowed an account to be created on the wrong
      // pipeline, where the journey rules do not apply.
      prisma.pipelineStage.findMany({
        where: {
          pipelineId: FULFILLMENT_PIPELINE_ID,
          isDeprecated: false,
        },
        orderBy: {
          position: "asc",
        },
        // The requirement count travels with the stage so the move dialog can
        // say what a stage will ask for before anybody commits to it. Counted
        // rather than loaded: the dialog only needs the number, and the gate
        // check fetches the requirements themselves when a target is picked.
        include: { _count: { select: { requirements: true } } },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          role: true,
          // The seat, not the access tier: the Add Client wizard offers
          // people by the seat they actually hold.
          teamRole: true,
          department: true,
          jobTitle: true,
          weeklyCapacityHours: true,
        },
      }),
    ]);

    return { stages, users };
  } catch (error) {
    console.error("[queries] Failed to load shared options.", error);
    return { stages: [], users: [] };
  }
}

export async function getDashboardData(user: AppUser) {
  try {
    const [clients, stages, performanceUsers, visibleAgencyTasks, featuredAgencyTasks] = await Promise.all([
      prisma.client.findMany({
        where: getClientVisibilityWhere(user),
        include: {
          assignedUser: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
          currentStage: true,
          agencyTasks: {
            select: {
              id: true,
              status: true,
              dueDate: true,
            },
          },
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      prisma.pipelineStage.findMany({
        orderBy: {
          position: "asc",
        },
      }),
      prisma.user.findMany({
        where: canViewAllAgencyData(user.role)
          ? { isActive: true }
          : { id: user.id, isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          department: true,
          jobTitle: true,
          weeklyCapacityHours: true,
          assignedClients: {
            select: { id: true },
          },
          assignedAgencyTasks: {
            select: {
              status: true,
              estimatedHours: true,
              dueDate: true,
            },
          },
        },
      }),
      prisma.employeeTask.findMany({
        where: getEmployeeTaskVisibilityWhere(user),
        select: {
          id: true,
          status: true,
          dueDate: true,
          estimatedHours: true,
        },
      }),
      prisma.employeeTask.findMany({
        where: {
          ...getEmployeeTaskVisibilityWhere(user),
          status: {
            not: "DONE",
          },
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              role: true,
              department: true,
            },
          },
          client: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 6,
      }),
    ]);

    const clientIds = clients.map((client) => client.id);
    const taskIds = visibleAgencyTasks.map((task) => task.id);
    const activities = await prisma.activityLog.findMany({
      where: canViewAllAgencyData(user.role)
        ? {}
        : {
            OR: [
              { actorId: user.id },
              ...(clientIds.length ? [{ entityId: { in: clientIds } }] : []),
              ...(taskIds.length ? [{ entityId: { in: taskIds } }] : []),
            ],
          },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    const teamPerformance = performanceUsers
      .map((member) => {
        const bookedHours = getOpenAgencyTaskHours(member.assignedAgencyTasks);
        return {
          id: member.id,
          name: member.name,
          role: member.role,
          department: member.department,
          jobTitle: member.jobTitle,
          assignedClients: member.assignedClients.length,
          activeTasks: countOpenAgencyTasks(member.assignedAgencyTasks),
          weeklyCapacityHours: member.weeklyCapacityHours,
          bookedHours,
          utilizationRate: getUtilizationRate(bookedHours, member.weeklyCapacityHours),
          overdueTasks: countOverdueAgencyTasks(member.assignedAgencyTasks),
        };
      })
      .sort((left, right) => {
        if (right.overdueTasks !== left.overdueTasks) {
          return right.overdueTasks - left.overdueTasks;
        }

        return right.utilizationRate - left.utilizationRate;
      });

    return {
      isDegraded: false,
      metrics: {
        existingClientsCount: clients.length,
        newClientsCount: clients.filter((client) => client.dateAdded >= subDays(new Date(), 30)).length,
        activeClientsCount: clients.filter((client) => client.status === "ACTIVE").length,
        openAgencyTasksCount: countOpenAgencyTasks(visibleAgencyTasks),
        overdueAgencyTasksCount: countOverdueAgencyTasks(visibleAgencyTasks),
        teamUtilizationRate: teamPerformance.length
          ? Math.round(
              teamPerformance.reduce((sum, member) => sum + member.utilizationRate, 0)
              / teamPerformance.length,
            )
          : 0,
      },
      pipelineOverview: stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        count: clients.filter((client) => client.currentStageId === stage.id).length,
      })),
      attentionClients: clients
        .filter((client) => getAttentionRank(client) > 0)
        .sort((left, right) => {
          const rankDifference = getAttentionRank(right) - getAttentionRank(left);

          if (rankDifference !== 0) {
            return rankDifference;
          }

          return +new Date(right.updatedAt) - +new Date(left.updatedAt);
        })
        .slice(0, 5)
        .map((client) => ({
          id: client.id,
          companyName: client.companyName,
          status: client.status,
          stageName: client.currentStage.name,
          assignedUserName: client.assignedUser?.name ?? null,
        })),
      recentActivity: activities,
      teamPerformance,
      agencyTasks: featuredAgencyTasks,
      departmentLoad: Object.values(
        performanceUsers.reduce<
          Record<
            string,
            {
              department: Department;
              members: number;
              openHours: number;
              capacityHours: number;
              utilizationRate: number;
            }
          >
        >((accumulator, member) => {
          const current =
            accumulator[member.department]
            ?? {
              department: member.department,
              members: 0,
              openHours: 0,
              capacityHours: 0,
              utilizationRate: 0,
            };

          current.members += 1;
          current.openHours += getOpenAgencyTaskHours(member.assignedAgencyTasks);
          current.capacityHours += member.weeklyCapacityHours;
          current.utilizationRate = getUtilizationRate(current.openHours, current.capacityHours);
          accumulator[member.department] = current;

          return accumulator;
        }, {}),
      ).sort((left, right) => right.utilizationRate - left.utilizationRate),
    };
  } catch (error) {
    console.error("[queries] Failed to load dashboard data.", error);
    return {
      isDegraded: true,
      metrics: {
        existingClientsCount: 0,
        newClientsCount: 0,
        activeClientsCount: 0,
        openAgencyTasksCount: 0,
        overdueAgencyTasksCount: 0,
        teamUtilizationRate: 0,
      },
      pipelineOverview: [],
      attentionClients: [],
      recentActivity: [],
      teamPerformance: [],
      agencyTasks: [],
      departmentLoad: [],
    };
  }
}

export async function getClientsData(user: AppUser, filters?: ClientFilters) {
  try {
    const [clients, options] = await Promise.all([
      prisma.client.findMany({
        where: buildClientFilters(user, filters),
        include: {
          assignedUser: {
            select: {
              id: true,
              name: true,
              role: true,
              department: true,
            },
          },
          currentStage: true,
          agencyTasks: {
            select: {
              id: true,
              status: true,
              dueDate: true,
            },
          },
        },
        orderBy: [{ dateAdded: "desc" }, { companyName: "asc" }],
      }),
      getSharedOptions(),
    ]);

    return {
      clients: clients.map((client) => ({
        ...client,
        openTaskCount: countOpenAgencyTasks(client.agencyTasks),
        overdueTaskCount: countOverdueAgencyTasks(client.agencyTasks),
      })),
      ...options,
    };
  } catch (error) {
    console.error("[queries] Failed to load clients data.", error);
    const options = await getSharedOptions();
    return {
      clients: [],
      ...options,
    };
  }
}

export async function getClientDetail(user: AppUser, clientId: string) {
  try {
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        ...getClientVisibilityWhere(user),
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            role: true,
            // The seat they hold, not their access level: the header says
            // "Project Manager" under the owner's name, and `role` is
            // OWNER/ADMIN/MANAGER, which is a different question.
            teamRole: true,
            email: true,
          },
        },
        currentStage: true,
        contacts: {
          orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        },
        invoices: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
        },
        /*
         * The Account tab reads the current agreement: value, dates, terms and
         * the stored document. Newest first and signed ones preferred, so a
         * draft raised beside a live contract does not displace it.
         */
        contracts: {
          where: { deletedAt: null },
          orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
        },
        strategyBrief: {
          include: {
            author: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
          },
        },

        /*
         * The structured strategy layer the Strategy tab reasons about. The
         * brief above stays the narrative; these carry the state - which
         * sections apply and how far each has got, the goals with their own
         * targets, the audiences, the positioning and the roadmap.
         */
        strategySections: {
          include: {
            owner: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
            updatedBy: { select: { id: true, name: true } },
          },
        },
        strategyGoals: {
          orderBy: { position: "asc" },
          include: { owner: { select: { id: true, name: true } } },
        },
        strategyAudiences: { orderBy: [{ tier: "asc" }, { position: "asc" }] },
        strategyValueProp: true,
        roadmapPhases: {
          include: { owner: { select: { id: true, name: true } } },
        },
        clientNotes: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { author: { select: { id: true, name: true } } },
        },
        assets: { orderBy: [{ isRequired: "desc" }, { type: "asc" }] },

        /* The A2P profile, for the compact readiness line on Strategy. The
           full workspace loads its own copy with samples and submissions. */
        a2pProfile: { include: { samples: { orderBy: { position: "asc" } } } },
        intakeForm: {
          include: { reviewedBy: { select: { id: true, name: true } } },
        },
        workstreams: {
          orderBy: { role: "asc" },
          include: { owner: { select: { id: true, name: true } } },
        },
        handoffs: {
          orderBy: { handedOffAt: "desc" },
          take: 5,
          include: {
            toUser: { select: { id: true, name: true } },
            fromUser: { select: { id: true, name: true } },
          },
        },
        currentOwner: { select: { id: true, name: true } },
        renewals: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { owner: { select: { id: true, name: true } } },
        },
        expansionOpportunities: {
          orderBy: { createdAt: "desc" },
          include: { owner: { select: { id: true, name: true } } },
        },
        testimonials: {
          orderBy: { createdAt: "desc" },
        },
        referralsGiven: {
          orderBy: { receivedAt: "desc" },
          include: { assignedTo: { select: { id: true, name: true } } },
        },
        offboarding: true,
        reports: {
          orderBy: { periodEnd: "desc" },
          include: {
            preparedBy: { select: { id: true, name: true } },
            reviewedBy: { select: { id: true, name: true } },
          },
        },
        optimizations: {
          orderBy: { createdAt: "desc" },
          include: {
            owner: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            completedBy: { select: { id: true, name: true } },
            cancelledBy: { select: { id: true, name: true } },
            /* The linked work, never a copy of it. */
            task: { select: { id: true, title: true, status: true, dueDate: true } },
          },
        },
        healthAssessments: {
          orderBy: { assessedAt: "desc" },
          take: 12,
          include: { assessedBy: { select: { id: true, name: true } } },
        },
        complaints: {
          orderBy: { raisedAt: "desc" },
          include: { owner: { select: { id: true, name: true } } },
        },
        recoveryPlans: {
          orderBy: { createdAt: "desc" },
          include: { owner: { select: { id: true, name: true } } },
        },
        approvals: {
          orderBy: { approvedAt: "desc" },
          include: {
            recordedBy: { select: { id: true, name: true } },
            withdrawnBy: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
          },
        },
        defects: {
          orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
          include: { assignedTo: { select: { id: true, name: true } } },
        },
        /*
         * The sign-off request, as opposed to the sign-off.
         *
         * Approval records what a client said; ReviewCycle records that they
         * were asked, by when, and which round it is. The Approvals tab needs
         * both - a status alone cannot say whether anybody has been asked, and
         * an approval on round one says nothing about round two.
         */
        reviewCycles: {
          orderBy: { roundNumber: "desc" },
          include: {
            approverContact: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            revisions: { select: { id: true, status: true } },
          },
        },
        qaPlans: {
          orderBy: { createdAt: "desc" },
          include: { tests: { orderBy: { position: "asc" } } },
        },
        launches: {
          orderBy: { createdAt: "desc" },
          include: {
            owner: { select: { id: true, name: true } },
            checklistItems: { orderBy: { position: "asc" } },
            monitoringChecks: { orderBy: { dueAt: "asc" } },
          },
        },
        accessRecords: {
          orderBy: [{ isCritical: "desc" }, { platform: "asc" }],
        },
        projects: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: {
            projectManager: { select: { id: true, name: true } },
            milestones: { orderBy: { position: "asc" } },
          },
        },
        /* Who filed the account away, for the archive card. */
        archivedBy: { select: { id: true, name: true } },
        agencyTasks: {
          /*
            * Deleted tasks were being loaded, thrown away by the Work tab in
            * the browser, and counted by the summary numbers that were not.
            * Filtered here, where both readers get the same answer.
            */
          where: { deletedAt: null },
          /*
            * Bounded. This include was the client record: 402 tasks on a
            * seeded account came to 471 KB, 98% of a 479 KB payload, shipped
            * on every tab whether or not anybody opened Work.
            *
            * The counts beside it no longer come from this array, so trimming
            * the list cannot change a number - see taskTotals below.
            */
          take: 250,
          include: {
            /*
             * Everything the Work tab shows about a task, read once here rather
             * than fetched per row. These are the same records My Work reads -
             * the tab is a different view of them, never a copy.
             */
            project: { select: { id: true, name: true } },
            reviewer: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
            /* Only the newest: the column asks whether today's update landed. */
            eodEntries: {
              orderBy: { entryDate: "desc" },
              take: 1,
              select: { entryDate: true, progressPercent: true },
            },
            /* Prerequisites, so a row can say it is waiting on another task. */
            blockedBy: {
              select: { prerequisiteTask: { select: { status: true } } },
            },
            _count: { select: { comments: true } },
            assignedTo: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        },
        stageHistory: {
          /* Also unbounded, and the same shape of problem at a smaller scale. */
          take: 100,
          include: {
            fromStage: true,
            toStage: true,
            changedBy: {
              select: {
                id: true,
                name: true,
                role: true,
              },
            },
          },
          orderBy: {
            changedAt: "desc",
          },
        },
      },
    });

    if (!client) {
      return null;
    }

    /*
     * The task numbers, counted by the database.
     *
     * They used to be counted in JavaScript over every task ever created on
     * the account, which meant downloading the whole history to render "2
     * overdue". Now the list can be bounded without the summary lying, and
     * the counts are exact whatever the take is.
     */
    const [total, overdue, blocked, open] = await Promise.all([
      prisma.employeeTask.count({ where: { clientId: client.id, deletedAt: null } }),
      prisma.employeeTask.count({
        where: {
          clientId: client.id,
          deletedAt: null,
          status: { notIn: [EmployeeTaskStatus.DONE, EmployeeTaskStatus.APPROVED, EmployeeTaskStatus.CANCELLED] },
          dueDate: { lt: new Date() },
        },
      }),
      prisma.employeeTask.count({
        where: { clientId: client.id, deletedAt: null, status: EmployeeTaskStatus.BLOCKED },
      }),
      prisma.employeeTask.count({
        where: {
          clientId: client.id,
          deletedAt: null,
          status: { notIn: [EmployeeTaskStatus.DONE, EmployeeTaskStatus.APPROVED, EmployeeTaskStatus.CANCELLED] },
        },
      }),
    ]);

    return {
      ...client,
      openTaskCount: open,
      overdueTaskCount: overdue,
      /* Exact, whatever the take above is, for anything that counts rather than lists. */
      taskTotals: { total, overdue, blocked, open },
      /* True when the list above is a window onto a longer history. */
      tasksTruncated: total > client.agencyTasks.length,
    };
  } catch (error) {
    console.error("[queries] Failed to load client detail.", error);
    return null;
  }
}

export async function getPipelineData(user: AppUser, assigneeId?: string | "ALL") {
  try {
    const [stages, clients, users] = await Promise.all([
      prisma.pipelineStage.findMany({
        orderBy: {
          position: "asc",
        },
      }),
      prisma.client.findMany({
        where: {
          ...getClientVisibilityWhere(user),
          ...(assigneeId && assigneeId !== "ALL" && canViewAllAgencyData(user.role)
            ? { assignedUserId: assigneeId }
            : {}),
        },
        // Exactly what a board card shows, and nothing else. Returning the whole
        // row sent every client's contract value, blocker and internal notes to
        // the browser, and the Decimal on monthlyValue cannot cross into a
        // client component at all.
        select: {
          id: true,
          companyName: true,
          clientName: true,
          status: true,
          serviceType: true,
          updatedAt: true,
          currentStageId: true,
          assignedUser: { select: { name: true } },
        },
        orderBy: {
          updatedAt: "desc",
        },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      stages: stages.map((stage) => ({
        ...stage,
        clients: clients.filter((client) => client.currentStageId === stage.id),
      })),
      users,
    };
  } catch (error) {
    console.error("[queries] Failed to load pipeline data.", error);
    return {
      stages: [],
      users: [],
    };
  }
}

export async function getWeeklyTaskTrackerData(user: AppUser, filters?: WeeklyTaskTrackerFilters) {
  const { selectedDate, weekStart, weekEnd } = getSelectedWeekRange(filters);
  const normalizedSearch = filters?.search?.trim();
  const selectedDateStart = selectedDate ? startOfDay(selectedDate) : null;
  const selectedDateEnd = selectedDate ? endOfDay(selectedDate) : null;

  const whereClauses: Prisma.EmployeeTaskWhereInput[] = [
    getEmployeeTaskVisibilityWhere(user),
    {
      weekStartDate: {
        gte: weekStart,
        lte: endOfDay(weekStart),
      },
    },
  ];

  if (filters?.clientId && filters.clientId !== "ALL") {
    whereClauses.push({ clientId: filters.clientId });
  }

  if (normalizedSearch) {
    whereClauses.push(buildWeeklyTaskSearchWhere(normalizedSearch));
  }

  if (selectedDateStart && selectedDateEnd) {
    whereClauses.push({
      OR: [
        {
          dueDate: {
            gte: selectedDateStart,
            lte: selectedDateEnd,
          },
        },
        {
          eodEntries: {
            some: {
              entryDate: {
                gte: selectedDateStart,
                lte: selectedDateEnd,
              },
            },
          },
        },
      ],
    });
  }

  try {
    const [tasks, clients] = await Promise.all([
      prisma.employeeTask.findMany({
        where: {
          AND: whereClauses,
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              department: true,
              jobTitle: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
          client: {
            select: {
              id: true,
              companyName: true,
              clientName: true,
            },
          },
          eodEntries: {
            where: {
              entryDate: {
                gte: weekStart,
                lte: weekEnd,
              },
            },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                },
              },
            },
            orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
          },
        },
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      }),
      prisma.client.findMany({
        where: getClientVisibilityWhere(user),
        orderBy: { companyName: "asc" },
        select: {
          id: true,
          companyName: true,
        },
      }),
    ]);

    const totalEodEntries = tasks.reduce((sum, task) => sum + task.eodEntries.length, 0);
    const tasksWithUpdates = tasks.filter((task) => task.eodEntries.length > 0).length;
    const clientsInView = new Set(
      tasks.map((task) => task.client?.id).filter((clientId): clientId is string => Boolean(clientId)),
    ).size;

    const dailyDigest = eachDayOfInterval({
      start: weekStart,
      end: weekEnd,
    }).map((day) => {
      const dayEntries = tasks.flatMap((task) =>
        task.eodEntries.filter((entry) => isSameDay(entry.entryDate, day)),
      );

      return {
        date: day,
        label: format(day, "EEE"),
        updates: dayEntries.length,
        tasksTouched: new Set(dayEntries.map((entry) => entry.taskId)).size,
        dueTasks: tasks.filter((task) => isSameDay(task.dueDate, day)).length,
      };
    });

    return {
      tasks,
      clients,
      week: {
        start: weekStart,
        end: weekEnd,
        label: `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`,
      },
      filters: {
        weekStart: format(weekStart, "yyyy-MM-dd"),
        date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
        clientId: filters?.clientId && filters.clientId !== "ALL" ? filters.clientId : "ALL",
        search: normalizedSearch ?? "",
      },
      summary: {
        taskCount: tasks.length,
        completedCount: tasks.filter((task) => task.status === "DONE").length,
        clientsInView,
        totalEodEntries,
        tasksWithUpdates,
        selectedDateEntryCount:
          selectedDateStart && selectedDateEnd
            ? tasks.reduce(
                (sum, task) =>
                  sum +
                  task.eodEntries.filter(
                    (entry) => entry.entryDate >= selectedDateStart && entry.entryDate <= selectedDateEnd,
                  ).length,
                0,
              )
            : null,
      },
      dailyDigest,
    };
  } catch (error) {
    console.error("[queries] Failed to load weekly task tracker data.", error);
    return {
      tasks: [],
      clients: [],
      week: {
        start: weekStart,
        end: weekEnd,
        label: `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`,
      },
      filters: {
        weekStart: format(weekStart, "yyyy-MM-dd"),
        date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
        clientId: filters?.clientId && filters.clientId !== "ALL" ? filters.clientId : "ALL",
        search: normalizedSearch ?? "",
      },
      summary: {
        taskCount: 0,
        completedCount: 0,
        clientsInView: 0,
        totalEodEntries: 0,
        tasksWithUpdates: 0,
        selectedDateEntryCount: selectedDateStart && selectedDateEnd ? 0 : null,
      },
      dailyDigest: eachDayOfInterval({
        start: weekStart,
        end: weekEnd,
      }).map((day) => ({
        date: day,
        label: format(day, "EEE"),
        updates: 0,
        tasksTouched: 0,
        dueTasks: 0,
      })),
    };
  }
}

export async function getTeamViewData(user: AppUser) {
  const dashboardData = await getDashboardData(user);
  try {
    const [users, agencyTasks, clients, assignableUsers, projects, sops] = await Promise.all([
      prisma.user.findMany({
        where: canViewAllAgencyData(user.role) ? { isActive: true } : { id: user.id },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          role: true,
          department: true,
          jobTitle: true,
          weeklyCapacityHours: true,
          assignedClients: {
            select: {
              id: true,
              companyName: true,
              status: true,
            },
          },
        },
      }),
      prisma.employeeTask.findMany({
        where: getEmployeeTaskVisibilityWhere(user),
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
              role: true,
              department: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              role: true,
              department: true,
            },
          },
          client: {
            select: {
              id: true,
              companyName: true,
            },
          },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      }),
      canManageEmployeeTasks(user.role)
        ? prisma.client.findMany({
            orderBy: { companyName: "asc" },
            select: {
              id: true,
              companyName: true,
            },
          })
        : Promise.resolve([]),
      canManageEmployeeTasks(user.role)
        ? prisma.user.findMany({
            where: { isActive: true, deletedAt: null },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              role: true,
              // The seat, so the form can suggest who normally does this work.
              teamRole: true,
              department: true,
              jobTitle: true,
              weeklyCapacityHours: true,
            },
          })
        : Promise.resolve([]),
      // Campaigns a task can belong to, and the SOPs the guidance panel links.
      canManageEmployeeTasks(user.role)
        ? prisma.project.findMany({
            where: { deletedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true, clientId: true },
          })
        : Promise.resolve([]),
      canManageEmployeeTasks(user.role)
        ? prisma.sop.findMany({
            orderBy: { reference: "asc" },
            select: { id: true, reference: true, title: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const agencyTaskSummary = {
      openCount: countOpenAgencyTasks(agencyTasks),
      dueSoonCount: agencyTasks.filter(
        (task) => task.status !== "DONE" && task.dueDate <= subDays(new Date(), -7),
      ).length,
      totalEstimatedHours: getOpenAgencyTaskHours(agencyTasks),
    };

    return {
      ...dashboardData,
      members: users,
      agencyTasks,
      agencyTaskSummary,
      taskOptions: {
        clients,
        users: assignableUsers,
        projects,
        sops,
      },
    };
  } catch (error) {
    console.error("[queries] Failed to load team view data.", error);
    return {
      ...dashboardData,
      isDegraded: true,
      members: [],
      agencyTasks: [],
      agencyTaskSummary: {
        openCount: 0,
        dueSoonCount: 0,
        totalEstimatedHours: 0,
      },
      taskOptions: {
        clients: [],
        users: [],
        projects: [],
        sops: [],
      },
    };
  }
}

export async function getAdminUsersData(user: AppUser) {
  if (user.role !== "ADMIN") {
    return null;
  }

  try {
    const users = await prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        department: true,
        jobTitle: true,
        weeklyCapacityHours: true,
        isActive: true,
        createdAt: true,
        assignedClients: {
          select: { id: true },
        },
        assignedAgencyTasks: {
          select: {
            id: true,
            status: true,
            estimatedHours: true,
          },
        },
      },
    });

    return {
      users,
    };
  } catch (error) {
    console.error("[queries] Failed to load admin users data.", error);
    return {
      users: [],
    };
  }
}

export const serviceTypeOptions = Object.values(ServiceType);
