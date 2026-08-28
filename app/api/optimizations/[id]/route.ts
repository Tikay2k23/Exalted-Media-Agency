import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  OPTIMIZATION_FAILURE_STATUS,
  addOptimizationNote,
  cancelOptimization,
  completeOptimization,
  monitorOptimization,
  startOptimization,
} from "@/lib/success/optimization-service";
import { optimizationActionSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Moves one optimization.
 *
 * One route for every state change rather than five, because they share the
 * same shape - who is asking, is the record still where they think it is, what
 * gets written - and the service refuses the ones that do not apply. The
 * workspace only offers the moves the record's own state allows, so a refusal
 * here means somebody else moved it first, which is worth saying out loud.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerAuthSession();
    const { id } = await params;

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = optimizationActionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Check the details and try again." },
        { status: 400 },
      );
    }

    const body = parsed.data;

    const result = await (() => {
      switch (body.action) {
        case "start":
          return startOptimization({ actor, optimizationId: id });
        case "monitor":
          return monitorOptimization({ actor, optimizationId: id });
        case "complete":
          return completeOptimization({
            actor,
            optimizationId: id,
            outcome: body.outcome,
            result: body.result,
            metricBefore: body.metricBefore,
            metricAfter: body.metricAfter,
            notes: body.notes,
          });
        case "cancel":
          return cancelOptimization({ actor, optimizationId: id, reason: body.reason });
        case "note":
          return addOptimizationNote({ actor, optimizationId: id, note: body.note });
      }
    })();

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: OPTIMIZATION_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, optimizationId: result.optimizationId });
  } catch (error) {
    console.error("[api/optimizations/:id] Failed to move optimization.", error);
    return NextResponse.json(
      { error: "Unable to update the optimization right now." },
      { status: 500 },
    );
  }
}
