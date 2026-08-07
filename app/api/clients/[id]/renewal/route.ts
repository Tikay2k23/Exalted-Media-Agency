import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { RENEWAL_FAILURE_STATUS, saveRenewal } from "@/lib/growth/renewal-service";
import { renewalSchema } from "@/lib/validators";

export const runtime = "nodejs";

function toDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function PUT(
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

    const parsed = renewalSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid renewal details" }, { status: 400 });
    }

    const dates = {
      renewalDate: toDate(parsed.data.renewalDate),
      contractEndDate: toDate(parsed.data.contractEndDate),
      meetingAt: toDate(parsed.data.meetingAt),
      decisionDate: toDate(parsed.data.decisionDate),
    };

    if (Object.values(dates).some((value) => value === undefined)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const result = await saveRenewal({
      actor,
      clientId: id,
      stage: parsed.data.stage,
      renewalDate: dates.renewalDate,
      contractEndDate: dates.contractEndDate,
      meetingAt: dates.meetingAt,
      decisionDate: dates.decisionDate,
      currentPackage: parsed.data.currentPackage,
      recommendedPackage: parsed.data.recommendedPackage,
      currentValue: parsed.data.currentValue,
      renewalValue: parsed.data.renewalValue,
      clientInterest: parsed.data.clientInterest,
      nextAction: parsed.data.nextAction,
      outcomeNote: parsed.data.outcomeNote,
      ownerId: parsed.data.ownerId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: RENEWAL_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/clients/:id/renewal] Failed to save renewal.", error);
    return NextResponse.json(
      { error: "Unable to save the renewal right now." },
      { status: 500 },
    );
  }
}
