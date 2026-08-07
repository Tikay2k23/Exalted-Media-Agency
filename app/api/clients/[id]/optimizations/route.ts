import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { REPORT_FAILURE_STATUS, saveOptimization } from "@/lib/success/report-service";
import { optimizationSchema } from "@/lib/validators";

export const runtime = "nodejs";

/** Records an optimization, or updates one when optimizationId is supplied. */
export async function POST(
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

    const parsed = optimizationSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid optimization details" }, { status: 400 });
    }

    const startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
    const endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;

    for (const value of [startDate, endDate]) {
      if (value && Number.isNaN(value.getTime())) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
    }

    const result = await saveOptimization({
      actor,
      clientId: id,
      optimizationId: parsed.data.optimizationId,
      platform: parsed.data.platform,
      observedProblem: parsed.data.observedProblem,
      proposedChange: parsed.data.proposedChange,
      evidence: parsed.data.evidence,
      hypothesis: parsed.data.hypothesis,
      expectedMetric: parsed.data.expectedMetric,
      previousSetting: parsed.data.previousSetting,
      newSetting: parsed.data.newSetting,
      startDate,
      endDate,
      result: parsed.data.result,
      decision: parsed.data.decision,
      ownerId: parsed.data.ownerId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: REPORT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(
      { ok: true, optimizationId: result.optimization.id },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/clients/:id/optimizations] Failed to save optimization.", error);
    return NextResponse.json(
      { error: "Unable to save the optimization right now." },
      { status: 500 },
    );
  }
}
