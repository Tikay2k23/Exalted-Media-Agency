import { LeadStatus, TeamRole } from "@prisma/client";
import { differenceInCalendarDays, endOfDay, startOfDay } from "date-fns";

import { type AuthContext } from "@/lib/authz";
import { isOpenTask } from "@/lib/journey/stage-requirements";
import { can } from "@/lib/permissions";
import type { EmployeeTaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  ALL_STATUSES,
  OPEN_STATUSES as CATALOGUE_OPEN_STATUSES,
} from "@/lib/tasks/task-catalogue";

/**
 * Role dashboards.
 *
 * Each seat gets a list of things that need a decision or an action today, not
 * a wall of numbers. A figure only earns a place here when knowing it changes
 * what somebody does next.
 *
 * Every section is a real query. A section with nothing in it says so rather
 * than being hidden, because "no overdue work" is itself useful to know.
 */

export type Urgency = "overdue" | "today" | "soon" | "normal";

export interface DashboardItem {
  id: string;
  title: string;
  /** Why this needs the reader, in plain language. */
  detail: string;
  href: string;
  urgency: Urgency;
}

export interface DashboardSection {
  key: string;
  title: string;
  /** Shown when the section is empty. Should read as good news. */
  emptyMessage: string;
  items: DashboardItem[];
}

export interface DashboardHeadline {
  label: string;
  value: string;
  tone?: "default" | "warning" | "danger";
}

export interface DashboardData {
  seatLabel: string;
  intro: string;
  headlines: DashboardHeadline[];
  sections: DashboardSection[];
  isDegraded: boolean;
}

function urgencyForDate(due: Date | null): Urgency {
  if (!due) {
    return "normal";
  }

  const now = new Date();

  if (due < startOfDay(now)) {
    return "overdue";
  }

  if (due <= endOfDay(now)) {
    return "today";
  }

  return differenceInCalendarDays(due, now) <= 7 ? "soon" : "normal";
}

function describeDue(due: Date | null) {
  if (!due) {
    return "No due date set";
  }

  const days = differenceInCalendarDays(due, new Date());

  if (days < 0) {
    return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  }
  if (days === 0) {
    return "Due today";
  }
  if (days === 1) {
    return "Due tomorrow";
  }

  return `Due in ${days} days`;
}

/** Plain wording for a dashboard. Built from the one catalogue of statuses. */
const STATUS_WORDING: Record<string, string> = Object.fromEntries(
  ALL_STATUSES.map((status) => [status.value, status.label]),
);

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  title: string;
  status: string;
  dueDate: Date;
  blocker: string | null;
  client: { id: string; companyName: string } | null;
  assignedTo: { name: string } | null;
}

function taskItem(task: TaskRow, detail?: string): DashboardItem {
  return {
    id: task.id,
    title: task.title,
    detail:
      detail
      ?? [
        task.client ? task.client.companyName : "No client",
        describeDue(task.dueDate),
      ].join(" · "),
    href: "/fulfillment",
    urgency: urgencyForDate(task.dueDate),
  };
}

async function loadTasks(where: Record<string, unknown>, take = 8) {
  return prisma.employeeTask.findMany({
    where: { deletedAt: null, ...where },
    orderBy: [{ dueDate: "asc" }],
    take,
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      blocker: true,
      client: { select: { id: true, companyName: true } },
      assignedTo: { select: { name: true } },
    },
  });
}

/** Lead statuses that still need somebody to work them. */
const OPEN_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.ATTEMPTING_CONTACT,
  LeadStatus.CONTACTED,
  LeadStatus.QUALIFIED,
  LeadStatus.NURTURE,
];

// Re-exported under the old local name so the queries below read unchanged.
const OPEN_STATUSES = CATALOGUE_OPEN_STATUSES;

/** The work sitting with one person. Used by every specialist seat. */
async function myWorkSections(actor: AuthContext): Promise<DashboardSection[]> {
  const now = new Date();

  const [overdue, upcoming, blocked, toReview] = await Promise.all([
    loadTasks({
      assignedToId: actor.id,
      status: { in: [...OPEN_STATUSES] },
      dueDate: { lt: startOfDay(now) },
    }),
    loadTasks({
      assignedToId: actor.id,
      status: { in: [...OPEN_STATUSES] },
      dueDate: { gte: startOfDay(now) },
    }),
    loadTasks({
      assignedToId: actor.id,
      status: { in: ["BLOCKED", "WAITING_CLIENT"] satisfies EmployeeTaskStatus[] },
    }),
    loadTasks({
      reviewerId: actor.id,
      status: { in: ["NEEDS_REVIEW"] satisfies EmployeeTaskStatus[] },
    }),
  ]);

  return [
    {
      key: "overdue",
      title: "Overdue",
      emptyMessage: "Nothing of yours is overdue.",
      items: overdue.map((task) => taskItem(task)),
    },
    {
      key: "upcoming",
      title: "Coming up",
      emptyMessage: "No work is scheduled for you right now.",
      items: upcoming.map((task) => taskItem(task)),
    },
    {
      key: "blocked",
      title: "Stuck or waiting",
      emptyMessage: "Nothing of yours is blocked.",
      items: blocked.map((task) =>
        taskItem(
          task,
          [
            STATUS_WORDING[task.status] ?? task.status,
            task.blocker ?? task.client?.companyName ?? "",
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      ),
    },
    {
      key: "review",
      title: "Waiting for your review",
      emptyMessage: "Nothing is waiting on you to review.",
      items: toReview.map((task) =>
        taskItem(task, `${task.assignedTo?.name ?? "Someone"} needs your review`),
      ),
    },
  ];
}

/** Accounts that are drifting, unowned, or blocked. */
async function attentionSection(scopedToOwnerId: string | null): Promise<DashboardSection> {
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      ...(scopedToOwnerId ? { assignedUserId: scopedToOwnerId } : {}),
    },
    select: {
      id: true,
      companyName: true,
      healthStatus: true,
      currentBlocker: true,
      assignedUserId: true,
      stageEnteredAt: true,
      currentStage: { select: { name: true, slaDays: true } },
    },
  });

  const items: DashboardItem[] = [];

  for (const client of clients) {
    const days = differenceInCalendarDays(new Date(), client.stageEnteredAt);
    const sla = client.currentStage.slaDays;
    const reasons: string[] = [];
    let urgency: Urgency = "normal";

    if (client.healthStatus === "RED") {
      reasons.push("health is red");
      urgency = "overdue";
    } else if (client.healthStatus === "YELLOW") {
      reasons.push("health is yellow");
      urgency = "soon";
    }

    if (!client.assignedUserId) {
      reasons.push("nobody owns this account");
      urgency = "overdue";
    }

    if (client.currentBlocker) {
      reasons.push(client.currentBlocker);
      urgency = urgency === "normal" ? "soon" : urgency;
    }

    if (sla !== null && days > sla) {
      reasons.push(`${days} days in ${client.currentStage.name}, target is ${sla}`);
      urgency = urgency === "normal" ? "soon" : urgency;
    }

    if (reasons.length) {
      items.push({
        id: client.id,
        title: client.companyName,
        detail: reasons.join(" · "),
        href: `/clients/${client.id}`,
        urgency,
      });
    }
  }

  return {
    key: "attention",
    title: "Accounts needing attention",
    emptyMessage: "Every account is owned, healthy, and on schedule.",
    items,
  };
}

// ---------------------------------------------------------------------------
// Seat dashboards
// ---------------------------------------------------------------------------

async function ownerDashboard(): Promise<Omit<DashboardData, "seatLabel" | "isDegraded">> {
  const now = new Date();

  const [clients, openTasks, overdueTasks, overrides, unreadCritical] = await Promise.all([
    prisma.client.findMany({
      where: { deletedAt: null },
      select: { monthlyValue: true, healthStatus: true },
    }),
    prisma.employeeTask.count({
      where: { deletedAt: null, status: { in: [...OPEN_STATUSES] } },
    }),
    prisma.employeeTask.count({
      where: {
        deletedAt: null,
        status: { in: [...OPEN_STATUSES] },
        dueDate: { lt: startOfDay(now) },
      },
    }),
    prisma.clientStageHistory.findMany({
      where: { wasOverridden: true },
      orderBy: { changedAt: "desc" },
      take: 5,
      select: {
        id: true,
        overrideReason: true,
        changedAt: true,
        client: { select: { id: true, companyName: true } },
        changedBy: { select: { name: true } },
        toStage: { select: { name: true } },
      },
    }),
    prisma.notification.count({ where: { urgency: "CRITICAL", readAt: null } }),
  ]);

  const monthlyRecurring = clients.reduce(
    (total, client) => total + (client.monthlyValue ? Number(client.monthlyValue) : 0),
    0,
  );
  const atRisk = clients.filter(
    (client) => client.healthStatus === "RED" || client.healthStatus === "YELLOW",
  ).length;

  return {
    intro: "Where the agency needs a decision from you.",
    headlines: [
      { label: "Active clients", value: String(clients.length) },
      { label: "Monthly recurring", value: monthlyRecurring.toLocaleString() },
      {
        label: "Clients at risk",
        value: String(atRisk),
        tone: atRisk > 0 ? "danger" : "default",
      },
      {
        label: "Overdue work",
        value: `${overdueTasks} of ${openTasks}`,
        tone: overdueTasks > 0 ? "warning" : "default",
      },
    ],
    sections: [
      await attentionSection(null),
      {
        key: "overrides",
        title: "Stage requirements that were overridden",
        emptyMessage: "No requirement has been bypassed.",
        items: overrides.map((entry) => ({
          id: entry.id,
          title: `${entry.client.companyName} moved to ${entry.toStage.name}`,
          detail: `${entry.changedBy?.name ?? "Someone"} — ${entry.overrideReason ?? "no reason recorded"}`,
          href: `/clients/${entry.client.id}`,
          urgency: "soon" as Urgency,
        })),
      },
      {
        key: "critical",
        title: "Critical alerts",
        emptyMessage: "No critical alerts are outstanding.",
        items: unreadCritical
          ? [
              {
                id: "critical-alerts",
                title: `${unreadCritical} unread critical alert${unreadCritical === 1 ? "" : "s"}`,
                detail: "Open the notification bell to review them.",
                href: "/dashboard",
                urgency: "overdue" as Urgency,
              },
            ]
          : [],
      },
    ],
  };
}

async function salesDashboard(
  actor: AuthContext,
): Promise<Omit<DashboardData, "seatLabel" | "isDegraded">> {
  const now = new Date();
  const scoped = can(actor, "leads.view.all") ? {} : { assignedToId: actor.id };
  const openLead = {
    deletedAt: null,
    status: { in: OPEN_LEAD_STATUSES },
    ...scoped,
  };

  const leadSelect = {
    id: true,
    businessName: true,
    contactName: true,
    status: true,
    score: true,
    nextFollowUpAt: true,
    createdAt: true,
  };

  const [overdueFollowUps, uncontacted, noNextAction, openCount] = await Promise.all([
    prisma.lead.findMany({
      where: { ...openLead, nextFollowUpAt: { lt: startOfDay(now) } },
      orderBy: { nextFollowUpAt: "asc" },
      take: 8,
      select: leadSelect,
    }),
    prisma.lead.findMany({
      where: { ...openLead, status: LeadStatus.NEW },
      orderBy: { createdAt: "asc" },
      take: 8,
      select: leadSelect,
    }),
    prisma.lead.findMany({
      where: { ...openLead, nextFollowUpAt: null },
      orderBy: { score: "desc" },
      take: 8,
      select: leadSelect,
    }),
    prisma.lead.count({ where: openLead }),
  ]);

  const leadItem = (
    lead: { id: string; businessName: string; contactName: string; score: number | null },
    detail: string,
    urgency: Urgency,
  ): DashboardItem => ({
    id: lead.id,
    title: lead.businessName,
    detail: `${lead.contactName} · ${detail}${lead.score !== null ? ` · score ${lead.score}` : ""}`,
    href: "/leads",
    urgency,
  });

  return {
    intro: "The leads that need you today, most urgent first.",
    headlines: [
      { label: "Open leads", value: String(openCount) },
      {
        label: "Follow-ups overdue",
        value: String(overdueFollowUps.length),
        tone: overdueFollowUps.length > 0 ? "danger" : "default",
      },
      {
        label: "Never contacted",
        value: String(uncontacted.length),
        tone: uncontacted.length > 0 ? "warning" : "default",
      },
    ],
    sections: [
      {
        key: "overdue-followups",
        title: "Follow-ups overdue",
        emptyMessage: "Every follow-up is on schedule.",
        items: overdueFollowUps.map((lead) =>
          leadItem(lead, describeDue(lead.nextFollowUpAt), "overdue"),
        ),
      },
      {
        key: "uncontacted",
        title: "Not contacted yet",
        emptyMessage: "Every lead has been contacted.",
        items: uncontacted.map((lead) =>
          leadItem(
            lead,
            `Came in ${describeDue(lead.createdAt).replace("overdue", "ago")}`,
            "today",
          ),
        ),
      },
      {
        key: "no-next-action",
        title: "No follow-up scheduled",
        emptyMessage: "Every open lead has a next action booked.",
        items: noNextAction.map((lead) =>
          leadItem(lead, "Nothing booked — set a follow-up date", "soon"),
        ),
      },
    ],
  };
}

// The project manager seat holds clients.view.all, and a six-person agency has
// one of them, so this dashboard is deliberately agency-wide rather than scoped.
async function projectManagerDashboard(): Promise<
  Omit<DashboardData, "seatLabel" | "isDegraded">
> {
  const now = new Date();

  const [overdue, waitingClient, blocked, unassigned, openCount] = await Promise.all([
    loadTasks({ status: { in: [...OPEN_STATUSES] }, dueDate: { lt: startOfDay(now) } }),
    loadTasks({ status: "WAITING_CLIENT" }),
    loadTasks({ status: "BLOCKED" }),
    prisma.employeeTask.findMany({
      where: { deletedAt: null, status: { in: [...OPEN_STATUSES] }, reviewerId: null, clientId: null },
      take: 5,
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        blocker: true,
        client: { select: { id: true, companyName: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.employeeTask.count({
      where: { deletedAt: null, status: { in: [...OPEN_STATUSES] } },
    }),
  ]);

  return {
    intro: "Delivery across every account you run.",
    headlines: [
      { label: "Open work", value: String(openCount) },
      {
        label: "Overdue",
        value: String(overdue.length),
        tone: overdue.length > 0 ? "danger" : "default",
      },
      {
        label: "Waiting on clients",
        value: String(waitingClient.length),
        tone: waitingClient.length > 0 ? "warning" : "default",
      },
    ],
    sections: [
      await attentionSection(null),
      {
        key: "overdue",
        title: "Overdue work",
        emptyMessage: "Nothing is overdue across the agency.",
        items: overdue.map((task) =>
          taskItem(
            task,
            `${task.assignedTo?.name ?? "Unassigned"} · ${task.client?.companyName ?? "No client"} · ${describeDue(task.dueDate)}`,
          ),
        ),
      },
      {
        key: "waiting-client",
        title: "Waiting on the client",
        emptyMessage: "Nothing is stuck with a client.",
        items: waitingClient.map((task) =>
          taskItem(task, `${task.client?.companyName ?? "No client"} — chase the client`),
        ),
      },
      {
        key: "blocked",
        title: "Blocked",
        emptyMessage: "Nothing is blocked.",
        items: blocked.map((task) =>
          taskItem(task, task.blocker ?? "No blocker reason recorded"),
        ),
      },
      {
        key: "unlinked",
        title: "Work with no client attached",
        emptyMessage: "All work is linked to an account.",
        items: unassigned.map((task) =>
          taskItem(task, "Not linked to any account — it will not show on client reporting"),
        ),
      },
    ],
  };
}

async function specialistDashboard(
  actor: AuthContext,
): Promise<Omit<DashboardData, "seatLabel" | "isDegraded">> {
  const now = new Date();
  const sections = await myWorkSections(actor);

  const [openCount, overdueCount] = await Promise.all([
    prisma.employeeTask.count({
      where: { deletedAt: null, assignedToId: actor.id, status: { in: [...OPEN_STATUSES] } },
    }),
    prisma.employeeTask.count({
      where: {
        deletedAt: null,
        assignedToId: actor.id,
        status: { in: [...OPEN_STATUSES] },
        dueDate: { lt: startOfDay(now) },
      },
    }),
  ]);

  return {
    intro: "Your work, most urgent first.",
    headlines: [
      { label: "Your open work", value: String(openCount) },
      {
        label: "Overdue",
        value: String(overdueCount),
        tone: overdueCount > 0 ? "danger" : "default",
      },
    ],
    sections,
  };
}

const SEAT_INTRO: Record<TeamRole, string> = {
  AGENCY_OWNER: "Agency Owner",
  SALES_REP: "Sales",
  PROJECT_MANAGER: "Project Manager",
  AUTOMATION_SPECIALIST: "Automation Specialist",
  CREATIVE_SPECIALIST: "Creative Specialist",
  ADS_SPECIALIST: "Ads and Reporting",
};

export async function getRoleDashboard(actor: AuthContext): Promise<DashboardData> {
  const seatLabel = SEAT_INTRO[actor.teamRole];

  try {
    const built = await (async () => {
      switch (actor.teamRole) {
        case TeamRole.AGENCY_OWNER:
          return ownerDashboard();
        case TeamRole.SALES_REP:
          return salesDashboard(actor);
        case TeamRole.PROJECT_MANAGER:
          return projectManagerDashboard();
        default:
          return specialistDashboard(actor);
      }
    })();

    return { seatLabel, isDegraded: false, ...built };
  } catch (error) {
    console.error("[dashboard-queries] Failed to build dashboard.", error);
    return {
      seatLabel,
      intro: "Your work, most urgent first.",
      headlines: [],
      sections: [],
      isDegraded: true,
    };
  }
}

export { isOpenTask };
