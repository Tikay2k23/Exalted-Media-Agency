import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { ADVOCACY_FAILURE_STATUS, saveReferral } from "@/lib/growth/advocacy-service";
import { referralSchema } from "@/lib/validators";

export const runtime = "nodejs";

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

    const parsed = referralSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid referral details" }, { status: 400 });
    }

    const result = await saveReferral({
      actor,
      clientId: id,
      referralId: parsed.data.referralId,
      contactName: parsed.data.contactName,
      businessName: parsed.data.businessName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      permissionGranted: parsed.data.permissionGranted,
      status: parsed.data.status,
      assignedToId: parsed.data.assignedToId,
      outcome: parsed.data.outcome,
      incentiveStatus: parsed.data.incentiveStatus,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: ADVOCACY_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, referralId: result.referral.id }, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/referrals] Failed to save referral.", error);
    return NextResponse.json(
      { error: "Unable to save the referral right now." },
      { status: 500 },
    );
  }
}
