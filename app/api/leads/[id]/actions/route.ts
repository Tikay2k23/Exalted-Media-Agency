import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  SALES_FAILURE_STATUS,
  logContact,
  markLost,
  markWon,
  moveLeadStage,
  moveToNurture,
  recordProposalSent,
  setNextStep,
  setStrategyCall,
} from "@/lib/sales/sales-actions";

export const runtime = "nodejs";

/**
 * Everything a salesperson does to a lead in a day, behind one door.
 *
 * The rules live in the service. This handler proves who is asking and hands
 * over, so there is no route that can set a stage the service would refuse.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("next-step"),
    nextAction: z.string().max(500).nullish(),
    nextFollowUpAt: z.string().nullish(),
  }),
  z.object({
    action: z.literal("log-contact"),
    channel: z.enum(["CALL", "EMAIL", "SMS", "MEETING"]),
    note: z.string().max(2000).nullish(),
    occurredAt: z.string().nullish(),
  }),
  z.object({
    action: z.literal("strategy-call"),
    at: z.string().nullish(),
    status: z.enum(["BOOKED", "SHOWED", "NO_SHOW", "CANCELLED", "RESCHEDULED"]).nullish(),
  }),
  z.object({
    action: z.literal("proposal-sent"),
    value: z.number().min(0).nullish(),
    sentAt: z.string().nullish(),
  }),
  z.object({
    action: z.literal("mark-lost"),
    reason: z.enum([
      "NO_RESPONSE",
      "NO_BUDGET",
      "NOT_INTERESTED",
      "WENT_WITH_COMPETITOR",
      "BAD_FIT",
      "OUTSIDE_SERVICE_AREA",
      "TIMING",
      "DUPLICATE_LEAD",
      "OTHER",
    ]),
    note: z.string().max(2000).nullish(),
  }),
  z.object({
    action: z.literal("mark-won"),
    finalValue: z.number().min(0).nullish(),
    clientId: z.string().nullish(),
  }),
  z.object({
    action: z.literal("move-stage"),
    stageKey: z.string().min(1).max(64),
  }),
  z.object({
    action: z.literal("nurture"),
    until: z.string().min(1),
    reason: z.string().max(500).nullish(),
  }),
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  const { id } = await params;

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await loadAuthContext(session.user.id);

  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const body = parsed.data;

  const result = await (() => {
    switch (body.action) {
      case "next-step":
        return setNextStep({
          actor,
          leadId: id,
          nextAction: body.nextAction,
          nextFollowUpAt: body.nextFollowUpAt,
        });
      case "log-contact":
        return logContact({
          actor,
          leadId: id,
          channel: body.channel,
          note: body.note ?? null,
          occurredAt: body.occurredAt ?? null,
        });
      case "strategy-call":
        return setStrategyCall({
          actor,
          leadId: id,
          at: body.at,
          status: body.status ?? null,
        });
      case "proposal-sent":
        return recordProposalSent({
          actor,
          leadId: id,
          value: body.value ?? null,
          sentAt: body.sentAt ?? null,
        });
      case "mark-lost":
        return markLost({ actor, leadId: id, reason: body.reason, note: body.note ?? null });
      case "mark-won":
        return markWon({
          actor,
          leadId: id,
          finalValue: body.finalValue ?? null,
          clientId: body.clientId ?? null,
        });
      case "move-stage":
        return moveLeadStage({ actor, leadId: id, stageKey: body.stageKey });
      case "nurture":
        return moveToNurture({
          actor,
          leadId: id,
          until: body.until,
          reason: body.reason ?? null,
        });
    }
  })();

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: SALES_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json(result);
}
