import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  FLAG_FAILURE_STATUS,
  raiseJourneyFlag,
  markDependencyReceived,
  recordFollowUp,
  resolveJourneyFlag,
} from "@/lib/journey/flag-service";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("raise"),
    kind: z.enum(["WAITING_ON_CLIENT", "BLOCKED", "REVISIONS_REQUIRED", "PAUSED"]),
    reason: z.string().min(3).max(500),
    detail: z.string().max(1000).nullish(),
    responsibleParty: z.string().max(160).nullish(),
    dueAt: z.string().nullish(),
    round: z.coerce.number().int().min(1).max(50).nullish(),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullish(),
    impact: z.enum(["BLOCKS_STAGE", "DELAYS_MILESTONE", "NO_BLOCK"]).nullish(),
    expectedResolutionAt: z.string().nullish(),
    requirementKey: z.string().max(120).nullish(),
    taskId: z.string().max(60).nullish(),
    contactId: z.string().max(60).nullish(),
  }),
  z.object({
    action: z.literal("resolve"),
    flagId: z.string().min(1),
    note: z.string().max(1000).nullish(),
  }),
  z.object({
    action: z.literal("follow-up"),
    flagId: z.string().min(1),
  }),
  z.object({
    action: z.literal("received"),
    flagId: z.string().min(1),
  }),
]);

/** Raising and clearing the secondary status on a client's journey. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const result =
      parsed.data.action === "raise"
        ? await raiseJourneyFlag({
            actor,
            clientId: id,
            kind: parsed.data.kind,
            reason: parsed.data.reason,
            detail: parsed.data.detail ?? null,
            responsibleParty: parsed.data.responsibleParty ?? null,
            dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
            round: parsed.data.round ?? null,
            severity: parsed.data.severity ?? null,
            impact: parsed.data.impact ?? null,
            expectedResolutionAt: parsed.data.expectedResolutionAt
              ? new Date(parsed.data.expectedResolutionAt)
              : null,
            requirementKey: parsed.data.requirementKey ?? null,
            taskId: parsed.data.taskId ?? null,
            contactId: parsed.data.contactId ?? null,
          })
        : parsed.data.action === "follow-up"
          ? await recordFollowUp({ actor, flagId: parsed.data.flagId })
          : parsed.data.action === "received"
            ? await markDependencyReceived({ actor, flagId: parsed.data.flagId })
            : await resolveJourneyFlag({
                actor,
                flagId: parsed.data.flagId,
                note: parsed.data.note ?? null,
              });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: FLAG_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/clients/journey-flags] Failed to update the condition.", error);
    return NextResponse.json(
      { error: "Unable to update this account right now." },
      { status: 500 },
    );
  }
}
