import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  AUDIT_FAILURE_STATUS,
  saveCorrectiveAction,
} from "@/lib/governance/audit-service";
import { correctiveActionSchema } from "@/lib/validators";

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

    const parsed = correctiveActionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid corrective action details" },
        { status: 400 },
      );
    }

    const dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;

    if (dueDate && Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
    }

    const result = await saveCorrectiveAction({
      actor,
      actionId: parsed.data.actionId,
      findingId: parsed.data.findingId,
      title: parsed.data.title,
      risk: parsed.data.risk,
      immediateCorrection: parsed.data.immediateCorrection,
      rootCause: parsed.data.rootCause,
      processCorrection: parsed.data.processCorrection,
      status: parsed.data.status,
      ownerId: parsed.data.ownerId,
      dueDate,
      evidenceUrl: parsed.data.evidenceUrl,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: AUDIT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, actionId: result.action.id }, { status: 201 });
  } catch (error) {
    console.error("[api/governance/corrective-actions] Failed to save action.", error);
    return NextResponse.json(
      { error: "Unable to save the corrective action right now." },
      { status: 500 },
    );
  }
}
