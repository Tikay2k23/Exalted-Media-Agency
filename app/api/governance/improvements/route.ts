import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { AUDIT_FAILURE_STATUS, saveImprovement } from "@/lib/governance/audit-service";
import { improvementSchema } from "@/lib/validators";

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

    const parsed = improvementSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid improvement details" }, { status: 400 });
    }

    const result = await saveImprovement({
      actor,
      improvementId: parsed.data.improvementId,
      title: parsed.data.title,
      problem: parsed.data.problem,
      source: parsed.data.source,
      proposedSolution: parsed.data.proposedSolution,
      benefit: parsed.data.benefit,
      effortEstimate: parsed.data.effortEstimate,
      priority: parsed.data.priority,
      status: parsed.data.status,
      ownerId: parsed.data.ownerId,
      result: parsed.data.result,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: AUDIT_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(
      { ok: true, improvementId: result.improvement.id },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/governance/improvements] Failed to save improvement.", error);
    return NextResponse.json(
      { error: "Unable to save the improvement right now." },
      { status: 500 },
    );
  }
}
