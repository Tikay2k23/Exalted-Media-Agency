import { NextResponse } from "next/server";
import { z } from "zod";

import { BRIEF_FAILURE_STATUS } from "@/app/api/clients/[id]/brief/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  approveBrief,
  requestBriefRevision,
  submitBriefForReview,
} from "@/lib/strategy/brief-service";

export const runtime = "nodejs";

const actionSchema = z.union([
  z.object({ action: z.literal("submit") }),
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("requestRevision"),
    reason: z.string().min(1).max(2000),
  }),
]);

/**
 * Moves the brief through review. Kept apart from saving so approval cannot
 * happen as a side effect of an edit.
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

    const parsed = actionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid review action" }, { status: 400 });
    }

    const result =
      parsed.data.action === "submit"
        ? await submitBriefForReview({ actor, clientId: id })
        : parsed.data.action === "approve"
          ? await approveBrief({ actor, clientId: id })
          : await requestBriefRevision({
              actor,
              clientId: id,
              reason: parsed.data.reason,
            });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code, missing: result.missing },
        { status: BRIEF_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/clients/:id/brief/review] Failed to review brief.", error);
    return NextResponse.json(
      { error: "Unable to update the brief right now." },
      { status: 500 },
    );
  }
}
