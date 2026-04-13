import {
  type ClientStatus,
  type Department,
  type EmployeeTask,
  Prisma,
  Role,
  ServiceType,
  type SocialMediaTask,
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

import {
  canManageEmployeeTasks,
  canViewAllAgencyData,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calculateFulfillmentRate } from "@/lib/utils";

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

function getTaskVisibilityWhere(user: AppUser): Prisma.SocialMediaTaskWhereInput {
  if (canViewAllAgencyData(user.role)) {
    return {};
  }

  return {
    OR: [
      { assignedUserId: user.id },
      { client: { assignedUserId: user.id } },
    ],
  };
}

function getEmployeeTaskVisibilityWhere(
  user: AppUser,
): Prisma.EmployeeTaskWhereInput {
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
  const weekStart = startOfDay(
    startOfWeek(anchorDate, { weekStartsOn: 1 }),
  );
  const weekEnd = endOfDay(endOfWeek(anchorDate, { weekStartsOn: 1 }));

  return {
    selectedDate,
    weekStart,
    weekEnd,
  };
}

function buildWeeklyTaskSearchWhere(
  search: string,
): Prisma.EmployeeTaskWhereInput {
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

function buildClientFilters(
  user: AppUser,
  filters?: ClientFilters,
): Prisma.ClientWhereInput {
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

  if (
    filters?.assigneeId &&
    filters.assigneeId !== "ALL" &&
    canViewAllAgencyData(user.role)
  ) {
    clauses.push({ assignedUserId: filters.assigneeId });
  }

  return {
    AND: clauses,
  };
}

function sumTaskRate(tasks: Pick<SocialMediaTask, "plannedPosts" | "completedPosts">[]) {
  const totals = tasks.reduce(
    (accumulator, task) => {
      accumulator.planned += task.plannedPosts;
      accumulator.completed += task.completedPosts;
      return accumulator;
    },
    { planned: 0, completed: 0 },
  );

  return {
    ...totals,
    rate: calculateFulfillmentRate(totals.completed, totals.planned),
  };
}

function countOpenAgencyTasks(tasks: Pick<EmployeeTask, "status">[]) {
  return tasks.filter((task) => task.status !== "DONE").length;
}

function getOpenAgencyTaskHours(
  tasks: Pick<EmployeeTask, "status" | "estimatedHours">[],
) {
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

export async function getSharedOptions() {
  const [stages, users] = await Promise.all([
    prisma.pipelineStage.findMany({
      orderBy: {
        position: "asc",
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        role: true,
        department: true,
        jobTitle: true,
        weeklyCapacityHours: true,
      },
    }),
  ]);

  return { stages, users };
}

export async function getDashboardData(user: AppUser) {
  const [clients, stages, performanceUsers, agencyTasks] = await Promise.all([
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
        socialTasks: true,
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
        assignedSocialTasks: {
          select: {
            plannedPosts: true,
            completedPosts: true,
            status: true,
          },
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
  const allTasks = clients.flatMap((client) => client.socialTasks);
  const fulfillmentTotals = sumTaskRate(allTasks);

  const activities = await prisma.activityLog.findMany({
    where: canViewAllAgencyData(user.role)
      ? {}
      : {
          OR: [
            { actorId: user.id },
            ...(clientIds.length
              ? [{ entityId: { in: clientIds } }]
              : []),
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

  return {
    metrics: {
      existingClientsCount: clients.length,
      newClientsCount: clients.filter((client) => client.dateAdded >= subDays(new Date(), 30)).length,
      fulfillmentRate: fulfillmentTotals.rate,
      plannedPosts: fulfillmentTotals.planned,
      completedPosts: fulfillmentTotals.completed,
      openAgencyTasksCount: countOpenAgencyTasks(agencyTasks),
      teamUtilizationRate: performanceUsers.length
        ? Math.round(
            performanceUsers.reduce((sum, member) => {
              const openHours = getOpenAgencyTaskHours(member.assignedAgencyTasks);
              return sum + getUtilizationRate(openHours, member.weeklyCapacityHours);
            }, 0) / performanceUsers.length,
          )
        : 0,
    },
    pipelineOverview: stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      count: clients.filter((client) => client.currentStageId === stage.id).length,
    })),
    performanceTrend: stages.map((stage) => {
      const stageClients = clients.filter((client) => client.currentStageId === stage.id);
      const stageTotals = sumTaskRate(stageClients.flatMap((client) => client.socialTasks));

      return {
        label: stage.name,
        clients: stageClients.length,
        fulfillmentRate: stageTotals.rate,
      };
    }),
    platformBreakdown: Object.values(
      allTasks.reduce<Record<string, { platform: string; planned: number; completed: number; rate: number }>>(
        (accumulator, task) => {
          const current =
            accumulator[task.platform] ??
            {
              platform: task.platform,
              planned: 0,
              completed: 0,
              rate: 0,
            };

          current.planned += task.plannedPosts;
          current.completed += task.completedPosts;
          current.rate = calculateFulfillmentRate(current.completed, current.planned);
          accumulator[task.platform] = current;

          return accumulator;
        },
        {},
      ),
    ),
    recentActivity: activities,
    teamPerformance: performanceUsers
      .map((member) => {
        const totals = sumTaskRate(member.assignedSocialTasks);
        const openAgencyHours = getOpenAgencyTaskHours(member.assignedAgencyTasks);

        return {
          id: member.id,
          name: member.name,
          role: member.role,
          department: member.department,
          jobTitle: member.jobTitle,
          assignedClients: member.assignedClients.length,
          plannedPosts: totals.planned,
          completedPosts: totals.completed,
          fulfillmentRate: totals.rate,
          weeklyCapacityHours: member.weeklyCapacityHours,
          bookedHours: openAgencyHours,
          utilizationRate: getUtilizationRate(
            openAgencyHours,
            member.weeklyCapacityHours,
          ),
          overdueTasks: member.assignedAgencyTasks.filter(
            (task) =>
              task.status !== "DONE" && task.dueDate < new Date(),
          ).length,
          activeTasks:
            member.assignedSocialTasks.filter((task) => task.status !== "COMPLETED").length +
            member.assignedAgencyTasks.filter((task) => task.status !== "DONE").length,
        };
      })
      .sort((a, b) => b.fulfillmentRate - a.fulfillmentRate),
    agencyTasks,
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
          accumulator[member.department] ??
          {
            department: member.department,
            members: 0,
            openHours: 0,
            capacityHours: 0,
            utilizationRate: 0,
          };

        current.members += 1;
        current.openHours += getOpenAgencyTaskHours(member.assignedAgencyTasks);
        current.capacityHours += member.weeklyCapacityHours;
        current.utilizationRate = getUtilizationRate(
          current.openHours,
          current.capacityHours,
        );
        accumulator[member.department] = current;

        return accumulator;
      }, {}),
    ).sort((a, b) => b.utilizationRate - a.utilizationRate),
  };
}

export async function getClientsData(user: AppUser, filters?: ClientFilters) {
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
        socialTasks: {
          orderBy: {
            dueDate: "asc",
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
      fulfillmentRate: calculateFulfillmentRate(
        client.socialTasks.reduce((sum, task) => sum + task.completedPosts, 0),
        client.socialTasks.reduce((sum, task) => sum + task.plannedPosts, 0),
      ),
    })),
    ...options,
  };
}

export async function getClientDetail(user: AppUser, clientId: string) {
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
        },
      },
      currentStage: true,
      socialTasks: {
        include: {
          assignedUser: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: {
          dueDate: "asc",
        },
      },
      stageHistory: {
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

  return {
    ...client,
    fulfillmentRate: calculateFulfillmentRate(
      client.socialTasks.reduce((sum, task) => sum + task.completedPosts, 0),
      client.socialTasks.reduce((sum, task) => sum + task.plannedPosts, 0),
    ),
  };
}

export async function getPipelineData(user: AppUser, assigneeId?: string | "ALL") {
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
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        socialTasks: true,
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
      clients: clients
        .filter((client) => client.currentStageId === stage.id)
        .map((client) => ({
          ...client,
          fulfillmentRate: calculateFulfillmentRate(
            client.socialTasks.reduce((sum, task) => sum + task.completedPosts, 0),
            client.socialTasks.reduce((sum, task) => sum + task.plannedPosts, 0),
          ),
        })),
    })),
    users,
  };
}

export async function getFulfillmentData(user: AppUser) {
  const tasks = await prisma.socialMediaTask.findMany({
    where: getTaskVisibilityWhere(user),
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          assignedUserId: true,
        },
      },
      assignedUser: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  const totals = sumTaskRate(tasks);
  const dueSoonBoundary = subDays(new Date(), -7);

  return {
    tasks: tasks.map((task) => ({
      ...task,
      fulfillmentRate: calculateFulfillmentRate(task.completedPosts, task.plannedPosts),
    })),
    summary: {
      fulfillmentRate: totals.rate,
      plannedPosts: totals.planned,
      completedPosts: totals.completed,
      dueSoonCount: tasks.filter(
        (task) => task.dueDate <= dueSoonBoundary && task.status !== "COMPLETED",
      ).length,
      completedTaskCount: tasks.filter((task) => task.status === "COMPLETED").length,
    },
    byPlatform: Object.values(
      tasks.reduce<Record<string, { platform: string; planned: number; completed: number; rate: number }>>(
        (accumulator, task) => {
          const current =
            accumulator[task.platform] ??
            {
              platform: task.platform,
              planned: 0,
              completed: 0,
              rate: 0,
            };

          current.planned += task.plannedPosts;
          current.completed += task.completedPosts;
          current.rate = calculateFulfillmentRate(current.completed, current.planned);
          accumulator[task.platform] = current;

          return accumulator;
        },
        {},
      ),
    ),
  };
}

export async function getWeeklyTaskTrackerData(
  user: AppUser,
  filters?: WeeklyTaskTrackerFilters,
) {
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

  const totalEodEntries = tasks.reduce(
    (sum, task) => sum + task.eodEntries.length,
    0,
  );
  const tasksWithUpdates = tasks.filter((task) => task.eodEntries.length > 0).length;
  const clientsInView = new Set(
    tasks
      .map((task) => task.client?.id)
      .filter((clientId): clientId is string => Boolean(clientId)),
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
                task.eodEntries.filter((entry) =>
                  entry.entryDate >= selectedDateStart &&
                  entry.entryDate <= selectedDateEnd,
                ).length,
              0,
            )
          : null,
    },
    dailyDigest,
  };
}

export async function getTeamViewData(user: AppUser) {
  const dashboardData = await getDashboardData(user);

  const [users, agencyTasks, clients, assignableUsers] = await Promise.all([
    prisma.user.findMany({
      where: canViewAllAgencyData(user.role)
        ? { isActive: true }
        : { id: user.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
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
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            role: true,
            department: true,
            jobTitle: true,
            weeklyCapacityHours: true,
          },
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
    },
  };
}

export async function getAdminUsersData(user: AppUser) {
  if (user.role !== "ADMIN") {
    return null;
  }

  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      jobTitle: true,
      weeklyCapacityHours: true,
      isActive: true,
      createdAt: true,
      assignedClients: {
        select: { id: true },
      },
      assignedSocialTasks: {
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
}

export const serviceTypeOptions = Object.values(ServiceType);
