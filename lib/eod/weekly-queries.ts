import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import { endOfWeek, startOfWeek } from "./weekly-view";

/**
 * Reading a week.
 *
 * Scoped like everything else: somebody who runs delivery sees the team, and
 * anybody else sees their own week. The page never widens this - it renders
 * what arrives.
 */
export async function getWeeklyWorkData(actor: AuthContext, weekStartInput?: string | null) {
  const requested = weekStartInput ? new Date(weekStartInput) : new Date();
  const weekStart = startOfWeek(Number.isNaN(requested.getTime()) ? new Date() : requested);
  const weekEnd = endOfWeek(weekStart);

  const seesTeam = can(actor, "workItems.view.all") || can(actor, "team.view");

  /*
   * Which tasks belong to this week.
   *
   * Deliberately wider than "due this week": work in progress on Wednesday
   * still needs an entry on Wednesday whether it is due Friday or a fortnight
   * out. So it is anything live, plus anything that finished inside the week -
   * which is what makes the completed count mean something.
   */
  const tasks = await prisma.employeeTask.findMany({
    where: {
      deletedAt: null,
      archivedAt: null,
      ...(seesTeam ? {} : { assignedToId: actor.id }),
      OR: [
        { status: { notIn: ["APPROVED", "DONE", "CANCELLED"] } },
        { completedAt: { gte: weekStart, lte: weekEnd } },
      ],
    },
    orderBy: [{ dueDate: "asc" }],
    take: 500,
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      dueDate: true,
      completedAt: true,
      archivedAt: true,
      blocker: true,
      estimatedHours: true,
      assignedTo: { select: { id: true, name: true, teamRole: true } },
      client: { select: { id: true, companyName: true } },
    },
  });

  const taskIds = tasks.map((task) => task.id);

  const [entries, members, reports] = await Promise.all([
    taskIds.length
      ? prisma.employeeTaskEodEntry.findMany({
          where: {
            taskId: { in: taskIds },
            entryDate: { gte: weekStart, lte: weekEnd },
          },
          orderBy: { entryDate: "asc" },
          select: {
            id: true,
            taskId: true,
            authorId: true,
            entryDate: true,
            summary: true,
            nextSteps: true,
            blockers: true,
            progressPercent: true,
            hoursSpent: true,
            workLink: true,
            taskStatus: true,
            createdAt: true,
            updatedAt: true,
            author: { select: { id: true, name: true } },
          },
        })
      : Promise.resolve([]),

    // Who is expected to report. Sales sits outside delivery reporting, so the
    // denominator is not inflated by a seat that never files an entry.
    prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(seesTeam ? {} : { id: actor.id }),
        teamRole: {
          in: [
            "PROJECT_MANAGER",
            "AUTOMATION_SPECIALIST",
            "CREATIVE_SPECIALIST",
            "ADS_SPECIALIST",
            "AGENCY_OWNER",
          ],
        },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, teamRole: true },
    }),

    prisma.weeklyReport.findMany({
      where: {
        weekStartDate: weekStart,
        ...(seesTeam ? {} : { userId: actor.id }),
      },
      select: {
        id: true,
        userId: true,
        status: true,
        summary: true,
        submittedAt: true,
        approvedAt: true,
        managerNote: true,
        weekStartDate: true,
        approvedBy: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, teamRole: true } },
      },
    }),
  ]);

  return { weekStart, weekEnd, tasks, entries, members, reports, seesTeam };
}

/** The latest entries written across the team, for the activity strip. */
export async function getRecentEodActivity(actor: AuthContext, take = 6) {
  const seesTeam = can(actor, "workItems.view.all") || can(actor, "team.view");

  return prisma.employeeTaskEodEntry.findMany({
    where: seesTeam ? {} : { authorId: actor.id },
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      updatedAt: true,
      createdAt: true,
      entryDate: true,
      author: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
    },
  });
}
