import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { HEALTH_FAILURE_STATUS, recordHealthAssessment } from "@/lib/success/health-service";
import { healthAssessmentSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Records a health assessment.
 *
 * Health is deliberately not settable through the account details endpoint any
 * more: a colour with nobody's name against it is not an assessment.
 */
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

    const parsed = healthAssessmentSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid assessment details" }, { status: 400 });
    }

    const result = await recordHealthAssessment({
      actor,
      clientId: id,
      status: parsed.data.status,
      summary: parsed.data.summary,
      healthScore: parsed.data.healthScore,
      satisfactionScore: parsed.data.satisfactionScore,
      renewalProbability: parsed.data.renewalProbability,
      cancellationThreat: parsed.data.cancellationThreat,
      communicationStatus: parsed.data.communicationStatus,
      paymentStatus: parsed.data.paymentStatus,
      performanceStatus: parsed.data.performanceStatus,
      clientParticipation: parsed.data.clientParticipation,
      factors: parsed.data.factors,
      strengths: parsed.data.strengths,
      risks: parsed.data.risks,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: HEALTH_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, assessmentId: result.assessment.id }, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/health] Failed to record assessment.", error);
    return NextResponse.json(
      { error: "Unable to record the assessment right now." },
      { status: 500 },
    );
  }
}
