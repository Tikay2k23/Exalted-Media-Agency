import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  TRAINING_FAILURE_STATUS,
  saveTrainingRecord,
} from "@/lib/governance/training-service";
import { trainingRecordSchema } from "@/lib/validators";

export const runtime = "nodejs";

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

    const parsed = trainingRecordSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid training details" }, { status: 400 });
    }

    const dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    const expiresAt = parsed.data.certificationExpiresAt
      ? new Date(parsed.data.certificationExpiresAt)
      : null;

    for (const value of [dueDate, expiresAt]) {
      if (value && Number.isNaN(value.getTime())) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
    }

    const result = await saveTrainingRecord({
      actor,
      recordId: parsed.data.recordId,
      userId: parsed.data.userId,
      courseName: parsed.data.courseName,
      sopReference: parsed.data.sopReference,
      status: parsed.data.status,
      dueDate,
      assessmentScore: parsed.data.assessmentScore,
      certificationAwarded: parsed.data.certificationAwarded,
      certificationExpiresAt: expiresAt,
      notes: parsed.data.notes,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: TRAINING_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, recordId: result.record.id }, { status: 201 });
  } catch (error) {
    console.error("[api/governance/training] Failed to save training record.", error);
    return NextResponse.json(
      { error: "Unable to save the training record right now." },
      { status: 500 },
    );
  }
}
