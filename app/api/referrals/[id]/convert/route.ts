import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import {
  ADVOCACY_FAILURE_STATUS,
  convertReferralToLead,
} from "@/lib/growth/advocacy-service";
import { referralConversionSchema } from "@/lib/validators";

export const runtime = "nodejs";

/**
 * Hands a referral to Sales as a normal lead.
 *
 * Its own endpoint rather than a status change, because it creates a record in
 * another module and is refused outright without the referring client's
 * permission.
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

    const parsed = referralConversionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await convertReferralToLead({
      actor,
      referralId: id,
      assignedToId: parsed.data.assignedToId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: ADVOCACY_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, leadId: result.lead.id }, { status: 201 });
  } catch (error) {
    console.error("[api/referrals/:id/convert] Failed to convert referral.", error);
    return NextResponse.json(
      { error: "Unable to convert the referral right now." },
      { status: 500 },
    );
  }
}
