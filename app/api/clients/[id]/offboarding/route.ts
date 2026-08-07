import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  OFFBOARDING_FAILURE_STATUS,
  saveOffboarding,
} from "@/lib/success/offboarding-service";
import { offboardingSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PUT(
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

    const parsed = offboardingSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid offboarding details" }, { status: 400 });
    }

    const finalServiceDate = parsed.data.finalServiceDate
      ? new Date(parsed.data.finalServiceDate)
      : null;
    const supportEndsAt = parsed.data.supportEndsAt
      ? new Date(parsed.data.supportEndsAt)
      : null;

    for (const value of [finalServiceDate, supportEndsAt]) {
      if (value && Number.isNaN(value.getTime())) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
    }

    const result = await saveOffboarding({
      actor,
      clientId: id,
      status: parsed.data.status,
      reason: parsed.data.reason,
      reasonDetail: parsed.data.reasonDetail,
      finalServiceDate,
      supportEndsAt,
      remainingWork: parsed.data.remainingWork,
      lessonsLearned: parsed.data.lessonsLearned,
      ownerId: parsed.data.ownerId,
      completeSteps: parsed.data.completeSteps,
      clearSteps: parsed.data.clearSteps,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code, outstanding: result.outstanding },
        { status: OFFBOARDING_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, status: result.record.status });
  } catch (error) {
    console.error("[api/clients/:id/offboarding] Failed to save offboarding.", error);
    return NextResponse.json(
      { error: "Unable to save the offboarding record right now." },
      { status: 500 },
    );
  }
}
