/**
 * Recording what a stage transition set in motion.
 *
 * The move itself is a transaction and needs no record: it either happened or
 * it did not. These are the effects that run after it commits - generating the
 * stage's work, recording the handoff, telling the people who now own it - and
 * each can fail on its own while the account has genuinely moved.
 *
 * That failure used to be the worst kind. An exception after the commit threw
 * out of the whole call, so the caller was told the move failed while the
 * client sat in the new stage with none of its work created and nobody
 * notified. Running a step through here writes down what happened and lets the
 * move stand, because it did happen, and a half-finished transition somebody
 * can see beats one that lies about itself.
 */

import type { AutomationAction, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export interface StepResult<T> {
  ok: boolean;
  value: T | null;
  error: string | null;
}

/** The message, not the stack: a trace in an interface is noise. */
function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);

  return String(error).slice(0, 500);
}

/**
 * Runs one step of a transition and records how it went.
 *
 * Never throws. A caller that wants to know can read the result, but nothing
 * downstream of a committed stage move should be able to undo it by failing.
 */
export async function runAutomationStep<T>(
  input: {
    clientId: string;
    historyId: string | null;
    action: AutomationAction;
    /** What the step produced, so the effect can be found again. */
    idsOf?: (value: T) => string[];
  },
  step: () => Promise<T>,
  client: PrismaClient = prisma,
): Promise<StepResult<T>> {
  const startedAt = new Date();

  let value: T;

  try {
    value = await step();
  } catch (error) {
    const message = messageFrom(error);

    /*
     * Recording the failure must not itself throw the caller out. If the
     * database is the thing that broke, there is nowhere to write this down,
     * and the move still stands.
     */
    try {
      await client.stageAutomationRun.create({
        data: {
          clientId: input.clientId,
          historyId: input.historyId,
          action: input.action,
          status: "FAILED",
          startedAt,
          completedAt: new Date(),
          lastError: message,
          generatedIds: [],
        },
      });
    } catch (writeError) {
      console.error("[automation] Could not record a failed step.", writeError);
    }

    console.error(`[automation] ${input.action} failed for ${input.clientId}.`, error);

    return { ok: false, value: null, error: message };
  }

  /*
   * The step worked. Recording it is bookkeeping, and bookkeeping that fails
   * must not turn a successful step into a reported failure - the work really
   * happened, and telling the caller otherwise sends somebody to fix something
   * that is not broken.
   */
  try {
    await client.stageAutomationRun.create({
      data: {
        clientId: input.clientId,
        historyId: input.historyId,
        action: input.action,
        status: "SUCCEEDED",
        startedAt,
        completedAt: new Date(),
        generatedIds: input.idsOf?.(value) ?? [],
      },
    });
  } catch (writeError) {
    console.error("[automation] Could not record a successful step.", writeError);
  }

  return { ok: true, value, error: null };
}

export interface AutomationRunView {
  id: string;
  action: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  retryCount: number;
  lastError: string | null;
  generatedCount: number;
  /** Which stage move this belonged to, where the history still exists. */
  stageName: string | null;
}

/** The log for one client, newest first. */
export async function getAutomationRuns(
  clientId: string,
  take = 30,
): Promise<AutomationRunView[]> {
  const runs = await prisma.stageAutomationRun.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      status: true,
      startedAt: true,
      completedAt: true,
      retryCount: true,
      lastError: true,
      generatedIds: true,
      history: { select: { toStage: { select: { name: true } } } },
    },
  });

  return runs.map((run) => ({
    id: run.id,
    action: run.action,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    retryCount: run.retryCount,
    lastError: run.lastError,
    generatedCount: run.generatedIds.length,
    stageName: run.history?.toStage?.name ?? null,
  }));
}
