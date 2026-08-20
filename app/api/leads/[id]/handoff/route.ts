import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  WON_FAILURE_STATUS,
  confirmHandoffPayment,
  retryHandoff,
} from "@/lib/sales/won-service";
import { handoffActionSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * The two things that can happen to a handoff after it is created: the payment
 * lands, or a failed run is retried. Both are idempotent - the service checks
 * the state and the per-step timestamps rather than trusting the caller.
 */
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
    const parsed = handoffActionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid handoff payload" }, { status: 400 });
    }

    const result =
      parsed.data.action === "confirm-payment"
        ? await confirmHandoffPayment({ actor, leadId: id })
        : await retryHandoff({ actor, leadId: id });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: WON_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/leads/handoff] Handoff action failed.", error);
    return NextResponse.json(
      { error: "Unable to update this handoff right now." },
      { status: 500 },
    );
  }
}
