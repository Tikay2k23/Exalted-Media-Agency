import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  WON_FAILURE_STATUS,
  getWonPreview,
  markLeadWon,
} from "@/lib/sales/won-service";
import { markWonSchema } from "@/lib/validators";

export const runtime = "nodejs";

async function actorFor() {
  const session = await getServerAuthSession();

  if (!session?.user) return null;

  return loadAuthContext(session.user.id);
}

/** What the Won confirmation dialog needs before anybody commits to anything. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await actorFor();

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await getWonPreview(actor, id);

    if ("ok" in result && result.ok === false) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: WON_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/leads/won] Failed to build the Won preview.", error);
    return NextResponse.json(
      { error: "Unable to prepare this opportunity right now." },
      { status: 500 },
    );
  }
}

/** Confirms the win and, when the money has landed, runs the handoff. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await actorFor();

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const parsed = markWonSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Won payload" }, { status: 400 });
    }

    const result = await markLeadWon({
      actor,
      leadId: id,
      data: {
        serviceType: parsed.data.serviceType,
        finalValue: parsed.data.finalValue ?? null,
        contractStatus: parsed.data.contractStatus,
        paymentStatus: parsed.data.paymentStatus,
        expectedStartDate: parsed.data.expectedStartDate
          ? new Date(parsed.data.expectedStartDate)
          : null,
        handoffNote: parsed.data.handoffNote || null,
        projectManagerId: parsed.data.projectManagerId || null,
        linkClientId: parsed.data.linkClientId || null,
        overrideDuplicate: parsed.data.overrideDuplicate,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.message,
          code: result.code,
          // The dialog needs the accounts found so it can offer them rather
          // than only saying no.
          matches: result.matches,
        },
        { status: WON_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/leads/won] Failed to mark the opportunity won.", error);
    return NextResponse.json(
      { error: "Unable to close this opportunity right now." },
      { status: 500 },
    );
  }
}
