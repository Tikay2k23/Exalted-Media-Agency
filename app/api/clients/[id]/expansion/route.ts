import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { RENEWAL_FAILURE_STATUS, saveExpansion } from "@/lib/growth/renewal-service";
import { expansionSchema } from "@/lib/validators";

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

    const parsed = expansionSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid opportunity details" }, { status: 400 });
    }

    const targetDate = parsed.data.targetDate ? new Date(parsed.data.targetDate) : null;

    if (targetDate && Number.isNaN(targetDate.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const result = await saveExpansion({
      actor,
      clientId: id,
      expansionId: parsed.data.expansionId,
      type: parsed.data.type,
      status: parsed.data.status,
      title: parsed.data.title,
      description: parsed.data.description,
      estimatedValue: parsed.data.estimatedValue,
      targetDate,
      outcomeNote: parsed.data.outcomeNote,
      ownerId: parsed.data.ownerId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: RENEWAL_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true, expansionId: result.expansion.id }, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/expansion] Failed to save opportunity.", error);
    return NextResponse.json(
      { error: "Unable to save the opportunity right now." },
      { status: 500 },
    );
  }
}
