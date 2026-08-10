import type { TeamRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The board for one seat.
 *
 * Scoped to a role rather than to a person on purpose: a specialist needs to
 * see their own column of work, but a project manager rebalancing the team
 * needs the whole seat. Who is looking decides which of those they get, in the
 * page.
 */
export async function getRoleBoard(role: TeamRole, ownerId?: string | null) {
  const workstreams = await prisma.clientWorkstream.findMany({
    where: {
      role,
      isRequired: true,
      stage: { not: "NOT_REQUIRED" },
      client: { deletedAt: null },
      ...(ownerId ? { ownerId } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      role: true,
      stage: true,
      blockedReason: true,
      startedAt: true,
      ownerId: true,
      owner: { select: { id: true, name: true } },
      client: {
        select: {
          id: true,
          companyName: true,
          serviceType: true,
          healthStatus: true,
          nextActionDueAt: true,
          currentStage: { select: { name: true, stageKey: true } },
        },
      },
    },
  });

  // Only people who hold this seat, for the assignment picker.
  const seatHolders = await prisma.user.findMany({
    where: { teamRole: role, isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return { workstreams, seatHolders };
}

/**
 * Everything on one person's plate, across every seat they hold.
 *
 * Deliberately not the same query as the board: this answers "what do I do
 * today", which is a question about tasks and dates, not about columns.
 */
export async function getMyWork(userId: string) {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 86_400_000);

  const [tasks, workstreams] = await Promise.all([
    prisma.employeeTask.findMany({
      where: {
        assignedToId: userId,
        deletedAt: null,
        status: { notIn: ["DONE", "CANCELLED"] },
      },
      orderBy: [{ dueDate: "asc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        category: true,
        client: { select: { id: true, companyName: true } },
      },
    }),
    prisma.clientWorkstream.findMany({
      where: {
        ownerId: userId,
        isRequired: true,
        stage: { notIn: ["NOT_REQUIRED", "COMPLETE"] },
        client: { deletedAt: null },
      },
      select: {
        id: true,
        role: true,
        stage: true,
        blockedReason: true,
        client: { select: { id: true, companyName: true } },
      },
    }),
  ]);

  return {
    overdue: tasks.filter((task) => task.dueDate < now),
    dueSoon: tasks.filter((task) => task.dueDate >= now && task.dueDate <= soon),
    later: tasks.filter((task) => task.dueDate > soon),
    waitingOnClient: tasks.filter((task) => task.status === "WAITING_CLIENT"),
    blocked: tasks.filter((task) => task.status === "BLOCKED"),
    workstreams,
  };
}
