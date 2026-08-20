import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  SALES_FAILURE_STATUS,
  addOpportunityTask,
  logContact,
  markLost,
  moveLeadStage,
  moveToNurture,
  recordProposalSent,
  setFollowers,
  setNextStep,
  setOpportunityDetails,
  setOwner,
  setStrategyCall,
  setTags,
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
  z.object({
    action: z.literal("set-tags"),
    tags: z.array(z.string().max(40)).max(20),
  }),
  z.object({
    action: z.literal("set-owner"),
    ownerId: z.string().nullable(),
  }),
  z.object({
    action: z.literal("set-followers"),
    userIds: z.array(z.string()).max(20),
  }),
  z.object({
    action: z.literal("add-task"),
    title: z.string().min(2).max(200),
    dueDate: z.string().min(1),
    assignedToId: z.string().nullish(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).nullish(),
    note: z.string().max(2000).nullish(),
  }),
  z.object({
    action: z.literal("set-opportunity"),
    opportunityName: z.string().max(120).nullish(),
    opportunityValue: z.number().min(0).max(10_000_000).nullish(),
    expectedCloseAt: z.string().nullish(),
    serviceInterest: z.string().max(60).nullish(),
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
      /*
       * Winning is deliberately not an action on this endpoint.
       *
       * It needs what was sold, for how much, whether the money arrived, and a
       * duplicate check against the existing accounts - none of which this
       * endpoint collects. POST /api/leads/[id]/won is the one way in, so
       * there is a single path that can create a client from a deal.
       */
      case "mark-won":
        return {
          ok: false as const,
          code: "NEEDS_CONFIRMATION" as const,
          message:
            "Closing an opportunity as Won needs the Won confirmation at /api/leads/[id]/won.",
        };
      case "move-stage":
        return moveLeadStage({ actor, leadId: id, stageKey: body.stageKey });
      case "nurture":
        return moveToNurture({
          actor,
          leadId: id,
          until: body.until,
          reason: body.reason ?? null,
        });
      case "set-tags":
        return setTags({ actor, leadId: id, tags: body.tags });
      case "set-owner":
        return setOwner({ actor, leadId: id, ownerId: body.ownerId });
      case "set-followers":
        return setFollowers({ actor, leadId: id, userIds: body.userIds });
      case "add-task":
        return addOpportunityTask({
          actor,
          leadId: id,
          title: body.title,
          dueDate: body.dueDate,
          assignedToId: body.assignedToId ?? null,
          priority: body.priority ?? null,
          note: body.note ?? null,
        });
      case "set-opportunity":
        return setOpportunityDetails({
          actor,
          leadId: id,
          opportunityName: body.opportunityName,
          opportunityValue: body.opportunityValue,
          expectedCloseAt: body.expectedCloseAt,
          serviceInterest: body.serviceInterest,
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
