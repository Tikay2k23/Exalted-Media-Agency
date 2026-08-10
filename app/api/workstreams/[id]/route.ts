import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  WORKSTREAM_FAILURE_STATUS,
  assignWorkstream,
  moveWorkstream,
} from "@/lib/workflow/workstream-transitions";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("move"),
    stage: z.enum([
      "ASSIGNED",
      "WAITING_ON_ACCESS",
      "WAITING_ON_ASSETS",
      "READY",
      "IN_PROGRESS",
      "SELF_REVIEW",
      "INTERNAL_REVIEW",
      "QA_CORRECTIONS",
      "READY_TO_SHIP",
      "LIVE",
      "COMPLETE",
    ]),
    blockedReason: z.string().max(1000).optional().or(z.literal("")),
  }),
  z.object({
    action: z.literal("assign"),
    ownerId: z.string().optional().or(z.literal("")),
  }),
]);

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

    const parsed = bodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (parsed.data.action === "assign") {
      const result = await assignWorkstream({
        actor,
        workstreamId: id,
        ownerId: parsed.data.ownerId || null,
      });

      if (!result.ok) {
        return NextResponse.json(
          { error: result.message, code: result.code },
          { status: WORKSTREAM_FAILURE_STATUS[result.code] },
        );
      }

      return NextResponse.json({ ok: true });
    }

    const result = await moveWorkstream({
      actor,
      workstreamId: id,
      stage: parsed.data.stage,
      blockedReason: parsed.data.blockedReason,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: WORKSTREAM_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, journeyMoved: result.journeyMoved });
  } catch (error) {
    console.error("[api/workstreams/:id] Failed to update workstream.", error);
    return NextResponse.json(
      { error: "Unable to update that right now." },
      { status: 500 },
    );
  }
}
