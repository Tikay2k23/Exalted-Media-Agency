import {
  type ChecklistItemStatus,
  LaunchChecklistCategory,
  LaunchStatus,
  type LaunchType,
  MonitoringResult,
  MonitoringWindow,
} from "@prisma/client";
import { addDays, addHours } from "date-fns";

import { logActivity } from "@/lib/activity";
import {
  certificationBlocksRestrictedWork,
  loadCertificationState,
} from "@/lib/governance/training-service";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Launch execution.
 *
 * A launch is the moment the agency's work becomes the client's live business,
 * so this module is deliberately the strictest in the system: it will not let
 * somebody activate without a verified backup, a written rollback plan, and a
 * named owner.
 */

export type LaunchFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_READY"
  | "INVALID"
  | "CERTIFICATION_LAPSED";

export interface LaunchFailure {
  ok: false;
  code: LaunchFailureCode;
  message: string;
  blockers?: string[];
}

function failure(code: LaunchFailureCode, message: string, blockers?: string[]): LaunchFailure {
  return { ok: false, code, message, blockers };
}

export interface ReadinessChecklistItem {
  label: string;
  isRequired: boolean;
  status: ChecklistItemStatus;
}

export interface ReadinessLaunch {
  ownerId: string | null;
  backupVerifiedAt: Date | null;
  rollbackPlan: string | null;
  isFrozen: boolean;
  checklistItems: ReadinessChecklistItem[];
}

export interface LaunchReadiness {
  ready: boolean;
  blockers: string[];
  completedRequired: number;
  totalRequired: number;
}

/**
 * Decides whether a launch may go ahead.
 *
 * Pure, so the rules can be tested exhaustively and read in one place. Every
 * blocker is phrased as the thing to go and do.
 */
export function deriveLaunchReadiness(launch: ReadinessLaunch): LaunchReadiness {
  const blockers: string[] = [];

  if (launch.isFrozen) {
    blockers.push("This launch is frozen. Lift the freeze before activating.");
  }

  if (!launch.ownerId) {
    blockers.push("No launch owner. Name who is accountable on the day.");
  }

  if (!launch.backupVerifiedAt) {
    blockers.push("No verified backup. Take one and confirm it restores.");
  }

  if (!launch.rollbackPlan?.trim()) {
    blockers.push("No rollback plan written down.");
  }

  const required = launch.checklistItems.filter(
    // An item marked not applicable was a deliberate decision, so it does not
    // count against the launch either way.
    (item) => item.isRequired && item.status !== "NOT_APPLICABLE",
  );
  const outstanding = required.filter((item) => item.status !== "COMPLETE");
  const failed = required.filter((item) => item.status === "FAILED");

  if (failed.length) {
    blockers.push(
      `${failed.length} checklist item(s) failed: ${failed.map((item) => item.label).join(", ")}.`,
    );
  }

  const notDone = outstanding.filter((item) => item.status !== "FAILED");

  if (notDone.length) {
    blockers.push(
      `${notDone.length} required checklist item(s) outstanding: `
      + `${notDone.slice(0, 3).map((item) => item.label).join(", ")}`
      + `${notDone.length > 3 ? ` and ${notDone.length - 3} more` : ""}.`,
    );
  }

  return {
    ready: blockers.length === 0,
    blockers,
    completedRequired: required.length - outstanding.length,
    totalRequired: required.length,
  };
}

/**
 * The standard launch checklist, from SOP section 18.
 *
 * Seeded on every new launch so nobody has to remember what a launch needs.
 * Items can be marked not applicable rather than deleted, which keeps the
 * record of what was considered.
 */
const DEFAULT_CHECKLIST: { category: LaunchChecklistCategory; label: string }[] = [
  { category: "APPROVAL", label: "Final client approval recorded" },
  { category: "BACKUP", label: "Backup taken and restore verified" },
  { category: "DOMAIN", label: "Domain and DNS ready" },
  { category: "WEBSITE", label: "Website pages reviewed on desktop and mobile" },
  { category: "FORMS", label: "Forms submit and notify correctly" },
  { category: "CALENDARS", label: "Calendars book and confirm" },
  { category: "PIPELINES", label: "Pipelines and stages configured" },
  { category: "WORKFLOWS", label: "Workflows fire and exit correctly" },
  { category: "EMAIL", label: "Email sending verified" },
  { category: "SMS", label: "SMS sending verified" },
  { category: "INTEGRATIONS", label: "Integrations connected and tested" },
  { category: "TRACKING", label: "Tracking and conversions firing" },
  { category: "PAYMENT", label: "Payment flow tested end to end" },
  { category: "ADS", label: "Campaigns ready and approved" },
  { category: "END_TO_END_TEST", label: "Full end-to-end test completed" },
  { category: "CLIENT_NOTIFICATION", label: "Client told the launch is happening" },
];

/** How long after activation each monitoring window falls due. */
const MONITORING_WINDOWS: { window: MonitoringWindow; hours: number }[] = [
  { window: "FIRST_TWO_HOURS", hours: 2 },
  { window: "FIRST_24_HOURS", hours: 24 },
  { window: "FIRST_72_HOURS", hours: 72 },
  { window: "FIRST_7_DAYS", hours: 24 * 7 },
];

async function loadClient(actor: AuthContext, clientId: string) {
  return prisma.client.findFirst({
    where: {
      id: clientId,
      deletedAt: null,
      ...(can(actor, "clients.view.all") ? {} : { assignedUserId: actor.id }),
    },
    select: { id: true, companyName: true, assignedUserId: true },
  });
}

export async function createLaunch(input: {
  actor: AuthContext;
  clientId: string;
  data: {
    name: string;
    type?: LaunchType;
    scheduledFor?: string | null;
    clientTimezone?: string | null;
    ownerId?: string | null;
    projectId?: string | null;
  };
}) {
  const { actor, clientId, data } = input;

  if (!can(actor, "launch.schedule")) {
    return failure("FORBIDDEN", "You do not have permission to schedule launches.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const scheduledFor = data.scheduledFor ? new Date(data.scheduledFor) : null;

  const launch = await prisma.$transaction(async (transaction) => {
    const created = await transaction.launch.create({
      data: {
        clientId: client.id,
        projectId: data.projectId || null,
        name: data.name,
        type: data.type ?? "FULL_LAUNCH",
        scheduledFor:
          scheduledFor && !Number.isNaN(scheduledFor.getTime()) ? scheduledFor : null,
        clientTimezone: data.clientTimezone || null,
        ownerId: data.ownerId || null,
      },
    });

    await transaction.launchChecklistItem.createMany({
      data: DEFAULT_CHECKLIST.map((item, index) => ({
        launchId: created.id,
        category: item.category,
        label: item.label,
        isRequired: true,
        position: index,
      })),
    });

    return created;
  });

  await logActivity({
    actorId: actor.id,
    action: `Scheduled launch "${launch.name}" for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { launchId: launch.id },
  });

  if (launch.ownerId) {
    await createNotifications(
      resolveRecipients([launch.ownerId], actor.id).map((recipientId) => ({
        recipientId,
        type: "LAUNCH_SCHEDULED" as const,
        urgency: "HIGH" as const,
        title: `You are running the launch for ${client.companyName}`,
        body: `${actor.name} made you the owner of "${launch.name}".`,
        entityType: "CLIENT" as const,
        entityId: client.id,
        href: `/clients/${client.id}`,
      })),
    );
  }

  return { ok: true as const, launch };
}

export async function updateLaunch(input: {
  actor: AuthContext;
  launchId: string;
  data: {
    ownerId?: string | null;
    scheduledFor?: string | null;
    rollbackPlan?: string | null;
    backupVerified?: boolean;
    isFrozen?: boolean;
    freezeReason?: string | null;
    status?: LaunchStatus;
  };
}) {
  const { actor, launchId, data } = input;

  if (!can(actor, "launch.schedule")) {
    return failure("FORBIDDEN", "You do not have permission to change launches.");
  }

  const existing = await prisma.launch.findUnique({
    where: { id: launchId },
    select: {
      id: true,
      name: true,
      status: true,
      backupVerifiedAt: true,
      client: { select: { id: true, companyName: true } },
    },
  });

  if (!existing) {
    return failure("NOT_FOUND", "Launch not found.");
  }

  if (data.isFrozen && !data.freezeReason?.trim()) {
    return failure("INVALID", "Freezing a launch needs a reason.");
  }

  const scheduledFor = data.scheduledFor ? new Date(data.scheduledFor) : null;

  const launch = await prisma.launch.update({
    where: { id: launchId },
    data: {
      ...(data.ownerId !== undefined
        ? {
            owner: data.ownerId
              ? { connect: { id: data.ownerId } }
              : { disconnect: true },
          }
        : {}),
      ...(data.scheduledFor !== undefined
        ? {
            scheduledFor:
              scheduledFor && !Number.isNaN(scheduledFor.getTime()) ? scheduledFor : null,
          }
        : {}),
      ...(data.rollbackPlan !== undefined
        ? { rollbackPlan: data.rollbackPlan || null }
        : {}),
      // Verification is a timestamped fact, not a checkbox someone can backdate.
      ...(data.backupVerified !== undefined
        ? { backupVerifiedAt: data.backupVerified ? (existing.backupVerifiedAt ?? new Date()) : null }
        : {}),
      ...(data.isFrozen !== undefined
        ? { isFrozen: data.isFrozen, freezeReason: data.isFrozen ? data.freezeReason : null }
        : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Updated launch "${launch.name}"`,
    entityType: "CLIENT",
    entityId: existing.client.id,
    ...(data.status !== undefined && data.status !== existing.status
      ? { fieldName: "launchStatus", previousValue: existing.status, newValue: launch.status }
      : {}),
  });

  return { ok: true as const, launch };
}

export async function setChecklistItemStatus(input: {
  actor: AuthContext;
  itemId: string;
  status: ChecklistItemStatus;
}) {
  const { actor, itemId, status } = input;

  if (!can(actor, "launch.schedule")) {
    return failure("FORBIDDEN", "You do not have permission to change launches.");
  }

  const item = await prisma.launchChecklistItem.findUnique({
    where: { id: itemId },
    select: { id: true, label: true, launch: { select: { id: true, clientId: true } } },
  });

  if (!item) {
    return failure("NOT_FOUND", "Checklist item not found.");
  }

  const updated = await prisma.launchChecklistItem.update({
    where: { id: itemId },
    data: {
      status,
      completedById: status === "COMPLETE" ? actor.id : null,
      completedAt: status === "COMPLETE" ? new Date() : null,
    },
  });

  return { ok: true as const, item: updated };
}

/**
 * Takes a launch live.
 *
 * Requires `launch.activate`, which is a narrower permission than scheduling,
 * and refuses outright when the launch is not ready. There is deliberately no
 * override here: the three things it insists on are the three that make a bad
 * launch recoverable.
 */
export async function activateLaunch(input: { actor: AuthContext; launchId: string }) {
  const { actor, launchId } = input;

  if (!can(actor, "launch.activate")) {
    return failure("FORBIDDEN", "You do not have permission to activate a launch.");
  }

  // SOP 40: somebody whose certification has lapsed does not do restricted
  // high-risk work, and taking a client's systems live is the most
  // consequential action in this application. This only bites once the agency
  // has actually certified this person - see training-service for why an
  // absent record is not treated as a lapsed one.
  const certification = await loadCertificationState(actor.id);

  if (certificationBlocksRestrictedWork(certification)) {
    return failure(
      "CERTIFICATION_LAPSED",
      "Your certification has expired, so you cannot activate a launch until it is renewed. Someone with training oversight can do that on the Governance page.",
    );
  }

  const launch = await prisma.launch.findUnique({
    where: { id: launchId },
    select: {
      id: true,
      name: true,
      status: true,
      ownerId: true,
      backupVerifiedAt: true,
      rollbackPlan: true,
      isFrozen: true,
      checklistItems: { select: { label: true, isRequired: true, status: true } },
      client: { select: { id: true, companyName: true, assignedUserId: true } },
    },
  });

  if (!launch) {
    return failure("NOT_FOUND", "Launch not found.");
  }

  if (launch.status === LaunchStatus.COMPLETE || launch.status === LaunchStatus.MONITORING) {
    return failure("INVALID", `"${launch.name}" has already been activated.`);
  }

  const readiness = deriveLaunchReadiness(launch);

  if (!readiness.ready) {
    return failure(
      "NOT_READY",
      `"${launch.name}" is not ready to go live.`,
      readiness.blockers,
    );
  }

  const activatedAt = new Date();

  await prisma.$transaction(async (transaction) => {
    await transaction.launch.update({
      where: { id: launchId },
      data: { status: LaunchStatus.MONITORING, completedAt: activatedAt },
    });

    // Post-launch monitoring is scheduled from the moment it actually went
    // live, so the windows mean what they say.
    await transaction.monitoringCheck.createMany({
      data: MONITORING_WINDOWS.map((entry) => ({
        launchId,
        window: entry.window,
        result: MonitoringResult.PENDING,
        dueAt:
          entry.hours >= 24
            ? addDays(activatedAt, entry.hours / 24)
            : addHours(activatedAt, entry.hours),
      })),
      skipDuplicates: true,
    });
  });

  await logActivity({
    actorId: actor.id,
    action: `Activated launch "${launch.name}" for ${launch.client.companyName}`,
    entityType: "CLIENT",
    entityId: launch.client.id,
    fieldName: "launchStatus",
    previousValue: launch.status,
    newValue: LaunchStatus.MONITORING,
  });

  // A client going live is an agency event, not just a delivery one. In a
  // six-person agency the launch owner is often the account owner too, so
  // without leadership here the alert would frequently reach nobody.
  const leadership = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      teamRole: { in: ["AGENCY_OWNER"] },
    },
    select: { id: true },
  });

  await createNotifications(
    resolveRecipients(
      [
        launch.ownerId,
        launch.client.assignedUserId,
        ...leadership.map((user) => user.id),
      ],
      actor.id,
    ).map(
      (recipientId) => ({
        recipientId,
        type: "LAUNCH_SCHEDULED" as const,
        urgency: "CRITICAL" as const,
        title: `${launch.client.companyName} is live`,
        body: "Monitoring windows are open at 2 hours, 24 hours, 72 hours, and 7 days.",
        entityType: "CLIENT" as const,
        entityId: launch.client.id,
        href: `/clients/${launch.client.id}`,
      }),
    ),
  );

  return { ok: true as const, readiness };
}

export async function recordMonitoringCheck(input: {
  actor: AuthContext;
  checkId: string;
  result: MonitoringResult;
  observations?: string | null;
}) {
  const { actor, checkId, result, observations } = input;

  if (!can(actor, "launch.view")) {
    return failure("FORBIDDEN", "You do not have permission to record monitoring.");
  }

  const check = await prisma.monitoringCheck.findUnique({
    where: { id: checkId },
    select: { id: true, window: true, launch: { select: { id: true, clientId: true, name: true } } },
  });

  if (!check) {
    return failure("NOT_FOUND", "Monitoring check not found.");
  }

  if (result !== MonitoringResult.PENDING && !observations?.trim()) {
    return failure("INVALID", "Record what you actually observed.");
  }

  const updated = await prisma.monitoringCheck.update({
    where: { id: checkId },
    data: {
      result,
      observations: observations || null,
      checkedAt: result === MonitoringResult.PENDING ? null : new Date(),
      checkedById: result === MonitoringResult.PENDING ? null : actor.id,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Recorded ${check.window.toLowerCase().replaceAll("_", " ")} monitoring on "${check.launch.name}" as ${result.toLowerCase()}`,
    entityType: "CLIENT",
    entityId: check.launch.clientId,
  });

  return { ok: true as const, check: updated };
}
