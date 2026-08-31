import {
  Prisma,
  UatEnvironment,
  UatReleaseScope,
  UatSeverity,
  UatStatus,
} from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { type AuthContext } from "@/lib/authz";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { UAT_MODULES } from "@/lib/governance/uat";

/**
 * Recording UAT.
 *
 * Every execution is a new row. Nothing here updates a previous run, because
 * "run 1 failed, run 2 passed" is the record that makes a fix auditable, and a
 * table that overwrites keeps only the last opinion.
 *
 * Corrective work goes into the task system that already exists. There is no
 * UAT task table and there will not be one: a fix a developer has to do is
 * work, and work belongs where the developer already looks for it.
 */

export type UatFailureCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT";

export const UAT_FAILURE_STATUS: Record<UatFailureCode, number> = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  CONFLICT: 409,
};

function failure(code: UatFailureCode, message: string) {
  return { ok: false as const, code, message };
}

/** Executing a test is operational work; anybody who runs the agency may. */
function canExecute(actor: AuthContext) {
  return can(actor, "governance.view");
}

/** Signing off a release is not. */
function canSignOff(actor: AuthContext) {
  return can(actor, "governance.audit");
}

/* -------------------------------------------------------------------------- */
/* Test cases                                                                 */
/* -------------------------------------------------------------------------- */

export async function createUatCase(input: {
  actor: AuthContext;
  module: string;
  name: string;
  purpose?: string | null;
  preconditions?: string | null;
  steps: string;
  expectedResult: string;
  severity?: UatSeverity;
  releaseScope?: UatReleaseScope;
  scopeReason?: string | null;
}) {
  const { actor } = input;

  if (!canExecute(actor)) {
    return failure("FORBIDDEN", "You do not have permission to manage UAT.");
  }

  if (!UAT_MODULES.includes(input.module as (typeof UAT_MODULES)[number])) {
    return failure("INVALID", `${input.module} is not a UAT module.`);
  }

  const name = input.name.trim();
  const steps = input.steps.trim();
  const expectedResult = input.expectedResult.trim();

  if (!name || !steps || !expectedResult) {
    return failure(
      "INVALID",
      "A test case needs a name, the steps to follow, and what should happen.",
    );
  }

  /*
   * The reference is allocated from the count rather than a sequence, so two
   * cases created at once could collide. The unique index catches it and the
   * retry takes the next number - which is cheaper than a sequence table for
   * something written a few dozen times.
   */
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const count = await prisma.uatTestCase.count();
    const reference = `UAT-${String(count + 1 + attempt).padStart(4, "0")}`;

    try {
      const testCase = await prisma.uatTestCase.create({
        data: {
          reference,
          module: input.module,
          name,
          purpose: input.purpose?.trim() || null,
          preconditions: input.preconditions?.trim() || null,
          steps,
          expectedResult,
          severity: input.severity ?? UatSeverity.P2,
          releaseScope: input.releaseScope ?? UatReleaseScope.LIMITED_BETA_REQUIRED,
          scopeReason: input.scopeReason?.trim() || null,
          createdById: actor.id,
        },
      });

      return { ok: true as const, testCase };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  return failure("CONFLICT", "Could not allocate a reference. Try again.");
}

/* -------------------------------------------------------------------------- */
/* Runs                                                                       */
/* -------------------------------------------------------------------------- */

export interface RecordRunInput {
  actor: AuthContext;
  testCaseId: string;
  status: UatStatus;
  actualResult?: string | null;
  severity?: UatSeverity | null;
  blockedReason?: string | null;
  evidenceUrl?: string | null;
  notes?: string | null;
  environment?: UatEnvironment;
  /** An existing task that fixes this. Never created here implicitly. */
  taskId?: string | null;
}

/**
 * One execution of a test case.
 *
 * Refuses a result that says nothing. A failure with no actual result is a
 * shrug in a field that is meant to be evidence, and a blocked test with no
 * reason is indistinguishable from one nobody got round to.
 */
export async function recordUatRun(input: RecordRunInput) {
  const { actor } = input;

  if (!canExecute(actor)) {
    return failure("FORBIDDEN", "You do not have permission to record UAT results.");
  }

  const testCase = await prisma.uatTestCase.findUnique({
    where: { id: input.testCaseId },
    select: { id: true, reference: true, name: true },
  });

  if (!testCase) return failure("NOT_FOUND", "Test case not found.");

  const actualResult = input.actualResult?.trim() || null;

  if (input.status === UatStatus.FAILED) {
    if (!actualResult) {
      return failure(
        "INVALID",
        "Say what actually happened. A failure with no result cannot be fixed or retested.",
      );
    }

    if (!input.severity) {
      return failure(
        "INVALID",
        "A failure needs a severity, because that is what decides whether it blocks the release.",
      );
    }
  }

  if (input.status === UatStatus.BLOCKED && !input.blockedReason?.trim()) {
    return failure(
      "INVALID",
      "Say why it could not be run. A blocked test with no reason reads as one nobody attempted.",
    );
  }

  if (input.taskId) {
    const task = await prisma.employeeTask.findFirst({
      where: { id: input.taskId, deletedAt: null },
      select: { id: true },
    });

    if (!task) return failure("NOT_FOUND", "That task does not exist.");
  }

  /*
   * The run number comes from the rows that exist, and the unique index on
   * (testCaseId, runNumber) settles two testers finishing at once - the loser
   * retries onto the next number rather than overwriting the winner.
   */
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const last = await prisma.uatTestRun.findFirst({
      where: { testCaseId: testCase.id },
      orderBy: { runNumber: "desc" },
      select: { runNumber: true },
    });

    try {
      const run = await prisma.uatTestRun.create({
        data: {
          testCaseId: testCase.id,
          runNumber: (last?.runNumber ?? 0) + 1 + attempt,
          status: input.status,
          actualResult,
          severity: input.status === UatStatus.FAILED ? input.severity : null,
          blockedReason: input.blockedReason?.trim() || null,
          evidenceUrl: input.evidenceUrl?.trim() || null,
          notes: input.notes?.trim() || null,
          environment: input.environment ?? UatEnvironment.DEVELOPMENT,
          testerId: actor.id,
          taskId: input.taskId ?? null,
        },
      });

      /*
       * Logged against the tester rather than into a client's history: a UAT
       * run is not something that happened to an account, and putting it there
       * would be the activity noise this application keeps out.
       */
      await logActivity({
        actorId: actor.id,
        action: `UAT ${testCase.reference} run ${run.runNumber}: ${input.status.toLowerCase()}`,
        entityType: "USER",
        entityId: actor.id,
        metadataJson: { testCaseId: testCase.id, runId: run.id },
      });

      return { ok: true as const, run };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  return failure("CONFLICT", "Somebody else recorded a run at the same time. Try again.");
}

/**
 * The corrective work for a failed run, in the existing task system.
 *
 * Attaches to the run rather than replacing it, so the failure and its fix are
 * one record. Refuses when the run already has a task, which is what stops a
 * double-click producing two.
 */
export async function createUatFixTask(input: {
  actor: AuthContext;
  runId: string;
  assignedToId: string;
  title?: string;
  dueDate?: Date | null;
  clientId?: string | null;
}) {
  const { actor } = input;

  if (!canExecute(actor)) {
    return failure("FORBIDDEN", "You do not have permission to raise UAT fixes.");
  }

  const run = await prisma.uatTestRun.findUnique({
    where: { id: input.runId },
    select: {
      id: true,
      status: true,
      severity: true,
      actualResult: true,
      taskId: true,
      testCase: { select: { reference: true, name: true, module: true } },
    },
  });

  if (!run) return failure("NOT_FOUND", "Test run not found.");

  if (run.status !== UatStatus.FAILED) {
    return failure("INVALID", "Only a failed run needs corrective work.");
  }

  if (run.taskId) {
    return failure("CONFLICT", "This run already has a fix task.");
  }

  const assignee = await prisma.user.findFirst({
    where: { id: input.assignedToId, isActive: true },
    select: { id: true },
  });

  if (!assignee) return failure("NOT_FOUND", "That person is not an active user.");

  /* P0 and P1 are the release blockers, so they arrive as high-priority work. */
  const priority =
    run.severity === UatSeverity.P0 || run.severity === UatSeverity.P1 ? "HIGH" : "MEDIUM";

  const task = await prisma.employeeTask.create({
    data: {
      title:
        input.title?.trim()
        || `${run.testCase.reference}: ${run.testCase.name}`,
      note: [
        `UAT ${run.testCase.reference} (${run.testCase.module}) failed.`,
        run.severity ? `Severity: ${run.severity}.` : null,
        run.actualResult ? `What happened: ${run.actualResult}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      status: "TODO",
      priority,
      dueDate: input.dueDate ?? new Date(Date.now() + 7 * 86_400_000),
      assignedToId: assignee.id,
      createdById: actor.id,
      clientId: input.clientId ?? null,
      category: "INTERNAL_OPERATIONS",
      estimatedHours: 2,
      weekStartDate: new Date(),
    },
    select: { id: true, title: true },
  });

  await prisma.uatTestRun.update({
    where: { id: run.id },
    data: { taskId: task.id },
  });

  await logActivity({
    actorId: actor.id,
    action: `Raised a fix for UAT ${run.testCase.reference}: ${task.title}`,
    entityType: "EMPLOYEE_TASK",
    entityId: task.id,
    metadataJson: { runId: run.id },
  });

  return { ok: true as const, task };
}

/**
 * Signing off Limited Beta.
 *
 * Recomputes readiness from the rows rather than trusting whatever the screen
 * was showing when somebody clicked - the button can only ever be as current
 * as its last render, and this is the decision that matters most.
 */
export async function approveLimitedBeta(input: { actor: AuthContext }) {
  const { actor } = input;

  if (!canSignOff(actor)) {
    return failure("FORBIDDEN", "Only an authorised administrator may sign off a release.");
  }

  const { uatReadiness } = await import("@/lib/governance/uat");
  const cases = await loadUatCases();
  const verdict = uatReadiness(cases);

  if (verdict.state !== "READY_FOR_LIMITED_BETA") {
    return {
      ok: false as const,
      code: "CONFLICT" as const,
      message: "Limited Beta cannot be approved yet.",
      blockers: verdict.blockers,
    };
  }

  await logActivity({
    actorId: actor.id,
    action: "Approved The Exalted Operations for Limited Beta",
    entityType: "USER",
    entityId: actor.id,
    metadataJson: { cases: cases.length },
  });

  return { ok: true as const, cases: cases.length };
}

/** Every case with its runs, newest run first, for the summary and the page. */
export async function loadUatCases() {
  const rows = await prisma.uatTestCase.findMany({
    orderBy: [{ module: "asc" }, { reference: "asc" }],
    include: {
      runs: {
        orderBy: { runNumber: "desc" },
        include: {
          tester: { select: { name: true } },
          task: { select: { id: true, title: true, status: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    module: row.module,
    name: row.name,
    severity: row.severity as "P0" | "P1" | "P2" | "P3",
    releaseScope: row.releaseScope as
      | "LIMITED_BETA_REQUIRED"
      | "PRODUCTION_REQUIRED"
      | "FUTURE_OUT_OF_SCOPE",
    scopeReason: row.scopeReason,
    runs: row.runs.map((run) => ({
      id: run.id,
      runNumber: run.runNumber,
      status: run.status as
        | "NOT_TESTED"
        | "TESTING"
        | "PASSED"
        | "FAILED"
        | "BLOCKED"
        | "RETEST_REQUIRED",
      severity: (run.severity as "P0" | "P1" | "P2" | "P3" | null) ?? null,
      actualResult: run.actualResult,
      blockedReason: run.blockedReason,
      testerName: run.tester?.name ?? null,
      testedAt: run.testedAt.toISOString(),
      taskId: run.taskId,
      taskTitle: run.task?.title ?? null,
      taskStatus: (run.task?.status as string | undefined) ?? null,
    })),
  }));
}
