import {
  type ClientStatus,
  type Department,
  type EmployeeTask,
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
          email: true,
        },
      },
      currentStage: true,
      agencyTasks: {
        include: {
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
    openTaskCount: countOpenAgencyTasks(client.agencyTasks),
    overdueTaskCount: countOverdueAgencyTasks(client.agencyTasks),
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
}

export async function getTeamViewData(user: AppUser) {
  const dashboardData = await getDashboardData(user);

  const [users, agencyTasks, clients, assignableUsers] = await Promise.all([
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
}

export const serviceTypeOptions = Object.values(ServiceType);
