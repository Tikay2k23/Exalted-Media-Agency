import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { HEALTH_FAILURE_STATUS, saveRecoveryPlan } from "@/lib/success/health-service";
import { recoveryPlanSchema } from "@/lib/validators";

export const runtime = "nodejs";

/** Creates a recovery plan, or updates one when planId is supplied. */
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

    const parsed = recoveryPlanSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid recovery plan details" }, { status: 400 });
    }

    const reviewDate = parsed.data.reviewDate ? new Date(parsed.data.reviewDate) : null;

    if (reviewDate && Number.isNaN(reviewDate.getTime())) {
      return NextResponse.json({ error: "Invalid review date" }, { status: 400 });
    }

    const result = await saveRecoveryPlan({
      actor,
      clientId: id,
      planId: parsed.data.planId,
      trigger: parsed.data.trigger,
      objective: parsed.data.objective,
      actions: parsed.data.actions,
      status: parsed.data.status,
      ownerId: parsed.data.ownerId,
      reviewDate,
      outcome: parsed.data.outcome,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: HEALTH_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, planId: result.plan.id }, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/recovery-plans] Failed to save plan.", error);
    return NextResponse.json(
      { error: "Unable to save the recovery plan right now." },
      { status: 500 },
    );
  }
}
