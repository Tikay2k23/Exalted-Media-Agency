import { type ProjectStatus, type RiskLevel, type ServiceType } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Delivery projects.
 *
 * A project is what production work hangs off: without one there is nothing to
 * plan, report, or hold a milestone against, which is why two stage gates check
 * for it before an account may enter production.
 */

export type ProjectFailureCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID";

export interface ProjectFailure {
  ok: false;
  code: ProjectFailureCode;
  message: string;
}

function failure(code: ProjectFailureCode, message: string): ProjectFailure {
  return { ok: false, code, message };
}

export interface ProgressMilestone {
  name: string;
  position: number;
  dueDate: Date | null;
  completedAt: Date | null;
}

export interface ProjectProgress {
  percentComplete: number;
  completedCount: number;
  totalCount: number;
  currentMilestone: string | null;
  nextMilestone: string | null;
  overdueCount: number;
}

/**
 * Works out where a project actually is from its milestones.
 *
 * Deliberately derived rather than stored: a hand-typed "80% complete" is a
 * guess that nobody updates, and it is the number people use to decide whether
 * a launch date still holds.
 */
export function deriveProjectProgress(
  milestones: ProgressMilestone[],
  now = new Date(),
): ProjectProgress {
  if (milestones.length === 0) {
    return {
      percentComplete: 0,
      completedCount: 0,
      totalCount: 0,
      currentMilestone: null,
      nextMilestone: null,
      overdueCount: 0,
    };
  }

  const ordered = [...milestones].sort((left, right) => left.position - right.position);
  const outstanding = ordered.filter((milestone) => !milestone.completedAt);
  const completedCount = ordered.length - outstanding.length;

  return {
    percentComplete: Math.round((completedCount / ordered.length) * 100),
    completedCount,
    totalCount: ordered.length,
    currentMilestone: outstanding[0]?.name ?? null,
    nextMilestone: outstanding[1]?.name ?? null,
    overdueCount: outstanding.filter(
      (milestone) => milestone.dueDate !== null && milestone.dueDate < now,
    ).length,
  };
}

async function loadVisibleClient(actor: AuthContext, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true, serviceType: true, assignedUserId: true },
  });
}

export interface CreateProjectInput {
  actor: AuthContext;
  clientId: string;
  data: {
    name: string;
    serviceType?: ServiceType | null;
    projectManagerId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    targetLaunchDate?: string | null;
    budgetedHours?: number | null;
  };
}

export async function createProject(input: CreateProjectInput) {
  const { actor, clientId, data } = input;

  if (!can(actor, "projects.manage")) {
    return failure("FORBIDDEN", "You do not have permission to create projects.");
  }

  const client = await loadVisibleClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  if (data.projectManagerId) {
    const manager = await prisma.user.findFirst({
      where: { id: data.projectManagerId, isActive: true, deletedAt: null },
      select: { id: true },
    });

    if (!manager) {
      return failure("NOT_FOUND", "That project manager could not be found.");
    }
  }

  const toDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const project = await prisma.project.create({
    data: {
      clientId: client.id,
      name: data.name,
      // Default to what the client actually bought rather than making someone
      // restate it.
      serviceType: data.serviceType ?? client.serviceType,
      projectManagerId: data.projectManagerId || null,
      startDate: toDate(data.startDate),
      dueDate: toDate(data.dueDate),
      targetLaunchDate: toDate(data.targetLaunchDate),
      budgetedHours: data.budgetedHours ?? null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Created project "${project.name}" for ${client.companyName}`,
    entityType: "PROJECT",
    entityId: project.id,
    metadataJson: { clientId: client.id },
  });

  if (project.projectManagerId) {
    await createNotifications(
      resolveRecipients([project.projectManagerId], actor.id).map((recipientId) => ({
        recipientId,
        type: "TASK_ASSIGNED" as const,
        urgency: "HIGH" as const,
        title: `You are managing ${project.name}`,
        body: `${actor.name} put you in charge of this project for ${client.companyName}.`,
        entityType: "CLIENT" as const,
        entityId: client.id,
        href: `/clients/${client.id}`,
      })),
    );
  }

  return { ok: true as const, project };
}

export interface UpdateProjectInput {
  actor: AuthContext;
  projectId: string;
  data: {
    name?: string;
    status?: ProjectStatus;
    riskLevel?: RiskLevel;
    projectManagerId?: string | null;
    targetLaunchDate?: string | null;
    clientDependency?: string | null;
  };
}

export async function updateProject(input: UpdateProjectInput) {
  const { actor, projectId, data } = input;

  if (!can(actor, "projects.manage")) {
    return failure("FORBIDDEN", "You do not have permission to change projects.");
  }

  const existing = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      projectManagerId: true,
      client: { select: { id: true, companyName: true } },
    },
  });

  if (!existing) {
    return failure("NOT_FOUND", "Project not found.");
  }

  const toDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.riskLevel !== undefined ? { riskLevel: data.riskLevel } : {}),
      ...(data.targetLaunchDate !== undefined
        ? { targetLaunchDate: toDate(data.targetLaunchDate) }
        : {}),
      ...(data.clientDependency !== undefined
        ? { clientDependency: data.clientDependency || null }
        : {}),
      ...(data.projectManagerId !== undefined
        ? {
            projectManager: data.projectManagerId
              ? { connect: { id: data.projectManagerId } }
              : { disconnect: true },
          }
        : {}),
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Updated project "${project.name}"`,
    entityType: "PROJECT",
    entityId: project.id,
    ...(data.status !== undefined && data.status !== existing.status
      ? { fieldName: "status", previousValue: existing.status, newValue: project.status }
      : {}),
  });

  return { ok: true as const, project };
}

export interface AddMilestoneInput {
  actor: AuthContext;
  projectId: string;
  data: { name: string; description?: string | null; dueDate?: string | null };
}

export async function addMilestone(input: AddMilestoneInput) {
  const { actor, projectId, data } = input;

  if (!can(actor, "projects.manage")) {
    return failure("FORBIDDEN", "You do not have permission to change projects.");
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true, _count: { select: { milestones: true } } },
  });

  if (!project) {
    return failure("NOT_FOUND", "Project not found.");
  }

  const dueDate = data.dueDate ? new Date(data.dueDate) : null;

  const milestone = await prisma.milestone.create({
    data: {
      projectId: project.id,
      name: data.name,
      description: data.description || null,
      dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      // Appended to the end. Reordering is a separate concern.
      position: project._count.milestones,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Added milestone "${milestone.name}" to ${project.name}`,
    entityType: "MILESTONE",
    entityId: milestone.id,
    metadataJson: { projectId: project.id },
  });

  return { ok: true as const, milestone };
}

export interface CompleteMilestoneInput {
  actor: AuthContext;
  milestoneId: string;
  completed: boolean;
}

export async function setMilestoneCompletion(input: CompleteMilestoneInput) {
  const { actor, milestoneId, completed } = input;

  if (!can(actor, "projects.manage")) {
    return failure("FORBIDDEN", "You do not have permission to change projects.");
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: { id: true, name: true, completedAt: true, project: { select: { id: true, name: true } } },
  });

  if (!milestone) {
    return failure("NOT_FOUND", "Milestone not found.");
  }

  const updated = await prisma.milestone.update({
    where: { id: milestoneId },
    data: { completedAt: completed ? new Date() : null },
  });

  await logActivity({
    actorId: actor.id,
    action: completed
      ? `Completed milestone "${milestone.name}" on ${milestone.project.name}`
      : `Reopened milestone "${milestone.name}" on ${milestone.project.name}`,
    entityType: "MILESTONE",
    entityId: milestone.id,
    fieldName: "completedAt",
    previousValue: milestone.completedAt?.toISOString() ?? null,
    newValue: updated.completedAt?.toISOString() ?? null,
  });

  return { ok: true as const, milestone: updated };
}
