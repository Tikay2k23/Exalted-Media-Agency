import {
  type DefectSeverity,
  DefectStatus,
  type Prisma,
  type QaTestStatus,
} from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { createNotifications, resolveRecipients } from "@/lib/notifications";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { evaluateDefectClosure } from "@/lib/quality/defect-closure";

/**
 * Quality assurance: test plans, test results, and defects.
 *
 * The rule that matters here is that the person who built something cannot be
 * the only person who says it works. That decision lives in
 * lib/quality/defect-closure.ts; this module enforces it.
 */

export type QualityFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "SELF_VERIFICATION"
  | "ALREADY_CLOSED";

export interface QualityFailure {
  ok: false;
  code: QualityFailureCode;
  message: string;
}

function failure(code: QualityFailureCode, message: string): QualityFailure {
  return { ok: false, code, message };
}

/** Statuses that mean a defect is no longer outstanding. */
const CLOSED_STATUSES: DefectStatus[] = [
  DefectStatus.CLOSED,
  DefectStatus.PASSED,
  DefectStatus.WONT_FIX,
];

export function isDefectOpen(status: DefectStatus) {
  return !CLOSED_STATUSES.includes(status);
}

async function nextDefectReference(transaction: Prisma.TransactionClient) {
  const latest = await transaction.defect.findFirst({
    where: { reference: { startsWith: "DEF-" } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });

  const current = latest ? Number.parseInt(latest.reference.slice(4), 10) : 0;
  const next = Number.isFinite(current) ? current + 1 : 1;

  return `DEF-${String(next).padStart(6, "0")}`;
}

/**
 * Finds a client this user is entitled to raise quality work against.
 *
 * Account ownership is not the right test here. A specialist builds the work
 * but rarely owns the relationship, so scoping on `assignedUserId` alone would
 * mean the people most likely to spot a defect are the ones who cannot log it.
 * Having assigned work on the account is enough.
 */
async function loadClient(actor: AuthContext, clientId: string) {
  const scope = can(actor, "clients.view.all")
    ? {}
    : {
        OR: [
          { assignedUserId: actor.id },
          { agencyTasks: { some: { assignedToId: actor.id, deletedAt: null } } },
        ],
      };

  return prisma.client.findFirst({
    where: { id: clientId, deletedAt: null, ...scope },
    select: { id: true, companyName: true, assignedUserId: true },
  });
}

export async function createDefect(input: {
  actor: AuthContext;
  clientId: string;
  data: {
    title: string;
    severity: DefectSeverity;
    description: string;
    deliverable?: string | null;
    stepsToReproduce?: string | null;
    expectedResult?: string | null;
    actualResult?: string | null;
    evidenceUrl?: string | null;
    assignedToId?: string | null;
    dueDate?: string | null;
    projectId?: string | null;
  };
}) {
  const { actor, clientId, data } = input;

  // Raising a defect is deliberately open to anyone who can test: a specialist
  // who spots a problem in someone else's work must be able to say so.
  if (!can(actor, "qa.test")) {
    return failure("FORBIDDEN", "You do not have permission to raise defects.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const dueDate = data.dueDate ? new Date(data.dueDate) : null;

  const defect = await prisma.$transaction(async (transaction) => {
    const reference = await nextDefectReference(transaction);

    return transaction.defect.create({
      data: {
        clientId: client.id,
        projectId: data.projectId || null,
        reference,
        title: data.title,
        severity: data.severity,
        status: data.assignedToId ? DefectStatus.ASSIGNED : DefectStatus.NEW,
        description: data.description,
        deliverable: data.deliverable || null,
        stepsToReproduce: data.stepsToReproduce || null,
        expectedResult: data.expectedResult || null,
        actualResult: data.actualResult || null,
        evidenceUrl: data.evidenceUrl || null,
        raisedById: actor.id,
        assignedToId: data.assignedToId || null,
        dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      },
    });
  });

  await logActivity({
    actorId: actor.id,
    action: `Raised ${defect.severity.toLowerCase()} defect ${defect.reference} on ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
    metadataJson: { defectId: defect.id, severity: defect.severity },
  });

  await createNotifications(
    resolveRecipients([defect.assignedToId, client.assignedUserId], actor.id).map(
      (recipientId) => ({
        recipientId,
        type: "QA_DEFECT" as const,
        // A critical defect is the one thing that stops a launch, so it is
        // escalated the moment it is raised.
        urgency:
          defect.severity === "CRITICAL" ? ("CRITICAL" as const) : ("HIGH" as const),
        title: `${defect.severity === "CRITICAL" ? "Critical defect" : "Defect"} ${defect.reference} on ${client.companyName}`,
        body: defect.title,
        entityType: "CLIENT" as const,
        entityId: client.id,
        href: `/clients/${client.id}`,
      }),
    ),
  );

  return { ok: true as const, defect };
}

export async function updateDefect(input: {
  actor: AuthContext;
  defectId: string;
  data: {
    status?: DefectStatus;
    severity?: DefectSeverity;
    assignedToId?: string | null;
    correctionNotes?: string | null;
    retestResult?: string | null;
    dueDate?: string | null;
  };
}) {
  const { actor, defectId, data } = input;

  if (!can(actor, "qa.test")) {
    return failure("FORBIDDEN", "You do not have permission to change defects.");
  }

  const existing = await prisma.defect.findUnique({
    where: { id: defectId },
    select: {
      id: true,
      reference: true,
      status: true,
      severity: true,
      assignedToId: true,
      raisedById: true,
      client: { select: { id: true, companyName: true } },
    },
  });

  if (!existing) {
    return failure("NOT_FOUND", "Defect not found.");
  }

  // Closing is a separate, stricter operation. Routing it through here would
  // sidestep the self-verification rule.
  if (data.status && CLOSED_STATUSES.includes(data.status)) {
    return failure(
      "INVALID",
      `Use the close action to resolve ${existing.reference}, so verification is recorded.`,
    );
  }

  const dueDate = data.dueDate ? new Date(data.dueDate) : null;

  const defect = await prisma.defect.update({
    where: { id: defectId },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.severity !== undefined ? { severity: data.severity } : {}),
      ...(data.correctionNotes !== undefined
        ? { correctionNotes: data.correctionNotes || null }
        : {}),
      ...(data.retestResult !== undefined
        ? { retestResult: data.retestResult || null }
        : {}),
      ...(data.dueDate !== undefined
        ? { dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null }
        : {}),
      ...(data.assignedToId !== undefined
        ? {
            assignedTo: data.assignedToId
              ? { connect: { id: data.assignedToId } }
              : { disconnect: true },
          }
        : {}),
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Updated defect ${defect.reference}`,
    entityType: "CLIENT",
    entityId: existing.client.id,
    ...(data.status !== undefined && data.status !== existing.status
      ? { fieldName: "defectStatus", previousValue: existing.status, newValue: defect.status }
      : {}),
  });

  return { ok: true as const, defect };
}

/**
 * Closes a defect.
 *
 * Delegates to `evaluateDefectClosure`, which refuses to let the person who did
 * the work sign it off alone. Someone with QA approval authority may close
 * their own work, but only with a written reason that is stored on the defect.
 */
export async function closeDefect(input: {
  actor: AuthContext;
  defectId: string;
  resolution: DefectStatus;
  retestResult?: string | null;
  overrideReason?: string | null;
}) {
  const { actor, defectId, resolution, retestResult, overrideReason } = input;

  if (!CLOSED_STATUSES.includes(resolution)) {
    return failure("INVALID", "A closing resolution is required.");
  }

  const defect = await prisma.defect.findUnique({
    where: { id: defectId },
    select: {
      id: true,
      reference: true,
      status: true,
      severity: true,
      assignedToId: true,
      raisedById: true,
      client: { select: { id: true, companyName: true, assignedUserId: true } },
    },
  });

  if (!defect) {
    return failure("NOT_FOUND", "Defect not found.");
  }

  const decision = evaluateDefectClosure({
    actor,
    defect: {
      reference: defect.reference,
      status: defect.status,
      severity: defect.severity,
      assignedToId: defect.assignedToId,
      raisedById: defect.raisedById,
    },
    overrideReason,
  });

  if (!decision.allowed) {
    return failure(
      decision.code === "ALREADY_CLOSED"
        ? "ALREADY_CLOSED"
        : decision.code === "NO_PERMISSION"
          ? "FORBIDDEN"
          : "SELF_VERIFICATION",
      decision.message,
    );
  }

  const closed = await prisma.defect.update({
    where: { id: defectId },
    data: {
      status: resolution,
      closedAt: new Date(),
      verifiedById: actor.id,
      retestResult: retestResult || null,
      closureOverrideReason: decision.requiresOverrideRecord
        ? (overrideReason?.trim() ?? null)
        : null,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: decision.requiresOverrideRecord
      ? `Closed defect ${defect.reference} on their own work, with a recorded reason`
      : `Closed defect ${defect.reference}`,
    entityType: "CLIENT",
    entityId: defect.client.id,
    fieldName: "defectStatus",
    previousValue: defect.status,
    newValue: resolution,
    metadataJson: {
      selfVerified: decision.requiresOverrideRecord,
      reason: decision.requiresOverrideRecord ? overrideReason?.trim() : undefined,
    },
  });

  // Self-verification is a governance event, so it is surfaced rather than
  // simply logged.
  if (decision.requiresOverrideRecord) {
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
        leadership.map((user) => user.id),
        actor.id,
      ).map((recipientId) => ({
        recipientId,
        type: "QA_DEFECT" as const,
        urgency: "HIGH" as const,
        title: `${actor.name} closed their own defect ${defect.reference}`,
        body: overrideReason?.trim() ?? "No reason recorded.",
        entityType: "CLIENT" as const,
        entityId: defect.client.id,
        href: `/clients/${defect.client.id}`,
      })),
    );
  }

  return { ok: true as const, defect: closed, selfVerified: decision.requiresOverrideRecord };
}

export async function createQaPlan(input: {
  actor: AuthContext;
  clientId: string;
  data: { name: string; deliverable: string; projectId?: string | null };
}) {
  const { actor, clientId, data } = input;

  if (!can(actor, "qa.test")) {
    return failure("FORBIDDEN", "You do not have permission to create QA plans.");
  }

  const client = await loadClient(actor, clientId);

  if (!client) {
    return failure("NOT_FOUND", "Client not found.");
  }

  const plan = await prisma.qaPlan.create({
    data: {
      clientId: client.id,
      projectId: data.projectId || null,
      name: data.name,
      deliverable: data.deliverable,
      ownerId: actor.id,
    },
  });

  await logActivity({
    actorId: actor.id,
    action: `Created QA plan "${plan.name}" for ${client.companyName}`,
    entityType: "CLIENT",
    entityId: client.id,
  });

  return { ok: true as const, plan };
}

export async function addQaTest(input: {
  actor: AuthContext;
  planId: string;
  data: { objective: string; steps: string; expectedResult: string };
}) {
  const { actor, planId, data } = input;

  if (!can(actor, "qa.test")) {
    return failure("FORBIDDEN", "You do not have permission to change QA plans.");
  }

  const plan = await prisma.qaPlan.findUnique({
    where: { id: planId },
    select: { id: true, name: true, _count: { select: { tests: true } } },
  });

  if (!plan) {
    return failure("NOT_FOUND", "QA plan not found.");
  }

  const test = await prisma.qaTest.create({
    data: {
      planId: plan.id,
      objective: data.objective,
      steps: data.steps,
      expectedResult: data.expectedResult,
      position: plan._count.tests,
    },
  });

  return { ok: true as const, test };
}

export async function recordTestResult(input: {
  actor: AuthContext;
  testId: string;
  status: QaTestStatus;
  actualResult?: string | null;
  evidenceUrl?: string | null;
}) {
  const { actor, testId, status, actualResult, evidenceUrl } = input;

  if (!can(actor, "qa.test")) {
    return failure("FORBIDDEN", "You do not have permission to record test results.");
  }

  const test = await prisma.qaTest.findUnique({
    where: { id: testId },
    select: { id: true, objective: true, plan: { select: { clientId: true } } },
  });

  if (!test) {
    return failure("NOT_FOUND", "Test not found.");
  }

  if (status === "FAILED" && !actualResult?.trim()) {
    return failure("INVALID", "A failed test needs the actual result recorded.");
  }

  const updated = await prisma.qaTest.update({
    where: { id: testId },
    data: {
      status,
      actualResult: actualResult || null,
      evidenceUrl: evidenceUrl || null,
      testerId: actor.id,
      executedAt: status === "NOT_RUN" ? null : new Date(),
      retestRequired: status === "RETEST_REQUIRED",
    },
  });

  return { ok: true as const, test: updated };
}
