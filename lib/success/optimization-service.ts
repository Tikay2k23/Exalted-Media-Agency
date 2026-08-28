import { OptimizationDecision } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { decisionForOutcome, OPTIMIZATION_OUTCOMES } from "@/lib/success/optimization-status";

/**
 * Moving an optimization through its life.
 *
 * Creating and editing one already lived in report-service and still does.
 * What is here is everything that changes its state - starting it, putting it
 * under observation, concluding it, calling it off - which the workspace needs
 * and which nothing had implemented.
 *
 * Every one of these is a conditional write. The state an optimization is in
 * is read from its own columns, so the only safe way to move it is to make the
 * move depend on it still being where the reader thought it was: two people
 * concluding the same test from two screens must not both succeed and leave
 * the second result silently on top of the first.
 */

export type OptimizationFailureCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID"
  | "CONFLICT";

export const OPTIMIZATION_FAILURE_STATUS: Record<OptimizationFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  CONFLICT: 409,
};

interface Failure {
  ok: false;
  code: OptimizationFailureCode;
  message: string;
}

function failure(code: OptimizationFailureCode, message: string): Failure {
  return { ok: false, code, message };
}

/** Decisions that mean nobody has concluded the test yet. */
const LIVE_DECISIONS: OptimizationDecision[] = [
  OptimizationDecision.PENDING,
  OptimizationDecision.CONTINUE_TESTING,
];

/**
 * The record, if this person is allowed to touch it.
 *
 * Visibility follows the client: somebody who cannot see the account cannot
 * see its optimizations. Changing one additionally needs the reporting seat,
 * and a specialist may only move their own - the permission model decides who
 * is which, this only applies it.
 */
async function loadOptimization(actor: AuthContext, optimizationId: string) {
  const scope = can(actor, "clients.view.all")
    ? {}
    : {
        OR: [
          { assignedUserId: actor.id },
          { agencyTasks: { some: { assignedToId: actor.id, deletedAt: null } } },
        ],
      };

  return prisma.optimization.findFirst({
    where: {
      id: optimizationId,
      client: { deletedAt: null, ...scope },
    },
    select: {
      id: true,
      clientId: true,
      title: true,
      platform: true,
      ownerId: true,
      decision: true,
      startDate: true,
      cancelledAt: true,
      notes: true,
      previousSetting: true,
      client: { select: { companyName: true } },
    },
  });
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadOptimization>>>;

/** What to call it in an activity line. Older rows have no title. */
function name(row: Loaded): string {
  return row.title?.trim() || `${row.platform} optimization`;
}

/**
 * Whether this person may move this particular record.
 *
 * Everybody with the reporting seat may move their own. Cancelling or
 * concluding somebody else's is a management action, which is what
 * clients.view.all distinguishes in this codebase.
 */
function mayAct(actor: AuthContext, row: Loaded): boolean {
  if (!can(actor, "reporting.client")) return false;
  if (can(actor, "clients.view.all")) return true;

  return row.ownerId === actor.id;
}

async function guard(actor: AuthContext, optimizationId: string) {
  const row = await loadOptimization(actor, optimizationId);

  if (!row) return failure("NOT_FOUND", "Optimization not found.");

  if (!mayAct(actor, row)) {
    return failure(
      "FORBIDDEN",
      "This optimization belongs to somebody else. You can add a note to it, but not move it.",
    );
  }

  return { ok: true as const, row };
}

/* -------------------------------------------------------------------------- */
/* Start                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Marks the change as made.
 *
 * The start date is the fact that turns a plan into work in progress, so this
 * writes exactly that and nothing else. Refuses if it already has one rather
 * than quietly moving the date somebody recorded.
 */
export async function startOptimization(input: {
  actor: AuthContext;
  optimizationId: string;
  startDate?: Date | null;
  now?: Date;
}) {
  const checked = await guard(input.actor, input.optimizationId);

  if ("ok" in checked && checked.ok === false) return checked;

  const { row } = checked as { ok: true; row: Loaded };
  const now = input.now ?? new Date();

  if (row.cancelledAt) {
    return failure("CONFLICT", "This optimization was cancelled and cannot be started.");
  }

  if (!LIVE_DECISIONS.includes(row.decision)) {
    return failure("CONFLICT", "This optimization has already been concluded.");
  }

  const startDate = input.startDate ?? now;

  const updated = await prisma.optimization.updateMany({
    /* Only from not-started, so two clicks cannot move the date twice. */
    where: { id: row.id, startDate: null, cancelledAt: null },
    data: { startDate },
  });

  if (updated.count === 0) {
    return failure("CONFLICT", "This optimization has already been started.");
  }

  await logActivity({
    actorId: input.actor.id,
    action: `Started optimization: ${name(row)} for ${row.client.companyName}`,
    entityType: "CLIENT",
    entityId: row.clientId,
    metadataJson: { optimizationId: row.id },
  });

  return { ok: true as const, optimizationId: row.id };
}

/* -------------------------------------------------------------------------- */
/* Monitor                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The change is live and being watched.
 *
 * CONTINUE_TESTING already meant this, so no new state was invented for it.
 */
export async function monitorOptimization(input: {
  actor: AuthContext;
  optimizationId: string;
  now?: Date;
}) {
  const checked = await guard(input.actor, input.optimizationId);

  if ("ok" in checked && checked.ok === false) return checked;

  const { row } = checked as { ok: true; row: Loaded };

  if (row.cancelledAt) {
    return failure("CONFLICT", "This optimization was cancelled.");
  }

  if (!row.startDate) {
    return failure(
      "INVALID",
      "Start the optimization first. There is nothing to monitor until the change has been made.",
    );
  }

  const updated = await prisma.optimization.updateMany({
    where: { id: row.id, decision: OptimizationDecision.PENDING, cancelledAt: null },
    data: { decision: OptimizationDecision.CONTINUE_TESTING },
  });

  if (updated.count === 0) {
    return failure("CONFLICT", "This optimization is no longer waiting on a decision.");
  }

  await logActivity({
    actorId: input.actor.id,
    action: `Moved optimization to monitoring: ${name(row)}`,
    entityType: "CLIENT",
    entityId: row.clientId,
    fieldName: "optimizationDecision",
    previousValue: row.decision,
    newValue: OptimizationDecision.CONTINUE_TESTING,
    metadataJson: { optimizationId: row.id },
  });

  return { ok: true as const, optimizationId: row.id };
}

/* -------------------------------------------------------------------------- */
/* Complete                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Concluding a test, which is not a status change.
 *
 * An optimization exists to answer whether a change worked, so completing one
 * without the measurement either side of it throws away the only thing it was
 * for. The result and both readings are required; the outcome chooses the
 * decision, because "we kept it" and "it beat expectations" are not the same
 * sentence and the table only ever recorded the first.
 */
export async function completeOptimization(input: {
  actor: AuthContext;
  optimizationId: string;
  outcome: string;
  result: string;
  metricBefore: string;
  metricAfter: string;
  notes?: string | null;
  now?: Date;
}) {
  const checked = await guard(input.actor, input.optimizationId);

  if ("ok" in checked && checked.ok === false) return checked;

  const { row } = checked as { ok: true; row: Loaded };
  const now = input.now ?? new Date();

  const decision = decisionForOutcome(input.outcome);

  if (!decision) {
    return failure(
      "INVALID",
      `Choose an outcome: ${OPTIMIZATION_OUTCOMES.map((o) => o.label).join(", ")}.`,
    );
  }

  const result = input.result.trim();
  const metricBefore = input.metricBefore.trim();
  const metricAfter = input.metricAfter.trim();

  if (!result) {
    return failure("INVALID", "Say what actually happened. An outcome with no result is a label.");
  }

  if (!metricBefore || !metricAfter) {
    return failure(
      "INVALID",
      "Record the measurement before and after. Without both there is nothing to compare and the outcome cannot be checked later.",
    );
  }

  if (row.cancelledAt) {
    return failure("CONFLICT", "This optimization was cancelled and cannot be completed.");
  }

  const updated = await prisma.optimization.updateMany({
    /*
     * Only from a live decision. Two people concluding the same test from two
     * screens: the second is told, rather than overwriting the first.
     */
    where: { id: row.id, decision: { in: LIVE_DECISIONS }, cancelledAt: null },
    data: {
      decision: decision as OptimizationDecision,
      result,
      metricBefore,
      metricAfter,
      /*
       * The old column recorded the configuration before the change and is
       * required by saveOptimization on a concluded row. Filled from the
       * reading when nobody recorded a setting, so concluding here does not
       * leave a record that its own editor would then refuse to save.
       */
      previousSetting: row.previousSetting ?? metricBefore,
      notes: input.notes?.trim() || undefined,
      endDate: now,
      completedAt: now,
      completedById: input.actor.id,
    },
  });

  if (updated.count === 0) {
    return failure(
      "CONFLICT",
      "Somebody else has already concluded this optimization. Reload to see what they recorded.",
    );
  }

  const label = OPTIMIZATION_OUTCOMES.find((o) => o.value === input.outcome)?.label ?? input.outcome;

  await logActivity({
    actorId: input.actor.id,
    action: `Completed optimization: ${name(row)} - ${label}`,
    entityType: "CLIENT",
    entityId: row.clientId,
    fieldName: "optimizationDecision",
    previousValue: row.decision,
    newValue: decision,
    metadataJson: {
      optimizationId: row.id,
      outcome: input.outcome,
      metricBefore,
      metricAfter,
    },
  });

  return { ok: true as const, optimizationId: row.id };
}

/* -------------------------------------------------------------------------- */
/* Cancel                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Called off, with the reason kept.
 *
 * Cancelled is a timestamp rather than a decision value: the decision column
 * answers "did the change work", and an abandoned test never answered it.
 */
export async function cancelOptimization(input: {
  actor: AuthContext;
  optimizationId: string;
  reason: string;
  now?: Date;
}) {
  const checked = await guard(input.actor, input.optimizationId);

  if ("ok" in checked && checked.ok === false) return checked;

  const { row } = checked as { ok: true; row: Loaded };
  const now = input.now ?? new Date();
  const reason = input.reason.trim();

  if (reason.length < 3) {
    return failure("INVALID", "Say why it was called off, or the record cannot be read later.");
  }

  if (!LIVE_DECISIONS.includes(row.decision)) {
    return failure("CONFLICT", "This optimization has already been concluded.");
  }

  const updated = await prisma.optimization.updateMany({
    where: { id: row.id, cancelledAt: null, decision: { in: LIVE_DECISIONS } },
    data: {
      cancelledAt: now,
      cancelledById: input.actor.id,
      cancelledReason: reason,
    },
  });

  if (updated.count === 0) {
    return failure("CONFLICT", "This optimization has already been cancelled or concluded.");
  }

  await logActivity({
    actorId: input.actor.id,
    action: `Cancelled optimization: ${name(row)}`,
    entityType: "CLIENT",
    entityId: row.clientId,
    metadataJson: { optimizationId: row.id, reason },
  });

  return { ok: true as const, optimizationId: row.id };
}

/* -------------------------------------------------------------------------- */
/* Note                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A line appended to the record's notes, dated and signed.
 *
 * Appended rather than replaced: progress notes are a history, and a text box
 * that overwrites is a history that only ever holds its last entry. Anybody
 * who can see the account may add one, including the specialist doing the
 * work, which is why this does not go through the ownership guard.
 */
export async function addOptimizationNote(input: {
  actor: AuthContext;
  optimizationId: string;
  note: string;
  now?: Date;
}) {
  const row = await loadOptimization(input.actor, input.optimizationId);

  if (!row) return failure("NOT_FOUND", "Optimization not found.");

  const note = input.note.trim();

  if (note.length < 2) return failure("INVALID", "Write the note first.");

  const now = input.now ?? new Date();
  const stamp = `${now.toISOString().slice(0, 10)} ${input.actor.name ?? "Unknown"}: ${note}`;

  await prisma.optimization.update({
    where: { id: row.id },
    data: { notes: row.notes ? `${row.notes}\n${stamp}` : stamp },
  });

  await logActivity({
    actorId: input.actor.id,
    action: `Noted progress on optimization: ${name(row)}`,
    entityType: "CLIENT",
    entityId: row.clientId,
    metadataJson: { optimizationId: row.id },
  });

  return { ok: true as const, optimizationId: row.id };
}
