import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { loadClientForEvaluation } from "@/lib/journey/evaluation-query";
import {
  getRequirementRemedy,
  resolveRemedyHref,
} from "@/lib/journey/requirement-remedies";
import { evaluateStageRequirements } from "@/lib/journey/stage-requirements";
import { moveClientStage } from "@/lib/journey/transition";
import { prisma } from "@/lib/prisma";
import { resolveRequestOrigin } from "@/lib/rate-limit";
import { pipelineMoveSchema } from "@/lib/validators";

export const runtime = "nodejs";

/** Maps a transition failure onto an HTTP status. */
const FAILURE_STATUS = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  OVERRIDE_NOT_PERMITTED: 403,
  BLOCKED: 409,
  OVERRIDE_INVALID: 400,
  STAGE_DEPRECATED: 400,
  PIPELINE_MISMATCH: 400,
} as const;

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = pipelineMoveSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid pipeline payload" }, { status: 400 });
    }

    const result = await moveClientStage({
      clientId: parsed.data.clientId,
      targetStageId: parsed.data.stageId,
      actor,
      note: parsed.data.note,
      override: parsed.data.override ?? null,
      origin: resolveRequestOrigin(
        Object.fromEntries(request.headers.entries()) as Record<string, string>,
      ),
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.message,
          code: result.code,
          // The caller needs to know exactly what is unmet so the interface can
          // show it, rather than a bare "not allowed".
          blocking: result.blocking?.map((evaluation) => ({
            key: evaluation.key,
            label: evaluation.label,
            reason: evaluation.reason,
          })),
        },
        { status: FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({
      ok: true,
      noChange: result.noChange,
      wasOverridden: result.wasOverridden,
      createdTaskCount: result.createdTaskCount,
    });
  } catch (error) {
    console.error("[api/pipeline/move] Failed to move pipeline card.", error);
    return NextResponse.json(
      { error: "Unable to move this client right now." },
      { status: 500 },
    );
  }
}

/**
 * Reports what currently blocks an account from entering a stage, so the
 * interface can show the gate before someone attempts the move.
 */
export async function GET(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId");
    const stageId = url.searchParams.get("stageId");

    if (!clientId || !stageId) {
      return NextResponse.json(
        { error: "clientId and stageId are required." },
        { status: 400 },
      );
    }

    const stage = await prisma.pipelineStage.findUnique({
      where: { id: stageId },
      select: {
        id: true,
        name: true,
        requirements: {
          select: { requirementKey: true, label: true, isBlocking: true },
          orderBy: { position: "asc" },
        },
      },
    });

    if (!stage) {
      return NextResponse.json({ error: "Pipeline stage not found." }, { status: 404 });
    }

    const client = await loadClientForEvaluation(clientId);

    if (!client) {
      return NextResponse.json({ error: "Client not found." }, { status: 404 });
    }

    const gate = evaluateStageRequirements(client, stage.requirements);

    return NextResponse.json({
      stageId: stage.id,
      stageName: stage.name,
      passed: gate.passed,
      evaluations: gate.evaluations.map((evaluation) => {
        const remedy = getRequirementRemedy(evaluation.key);

        return {
          key: evaluation.key,
          label: evaluation.label,
          isBlocking: evaluation.isBlocking,
          satisfied: evaluation.satisfied,
          reason: evaluation.reason,
          // Telling someone they are blocked without telling them how to get
          // unblocked is the whole reason this endpoint exists.
          whatItMeans: remedy.whatItMeans,
          howToFix: remedy.howToFix,
          actionLabel: remedy.actionLabel ?? null,
          actionHref: resolveRemedyHref(remedy, clientId),
          notBuiltYet: remedy.notBuiltYet ?? false,
        };
      }),
    });
  } catch (error) {
    console.error("[api/pipeline/move] Failed to evaluate stage gate.", error);
    return NextResponse.json(
      { error: "Unable to evaluate this stage right now." },
      { status: 500 },
    );
  }
}
