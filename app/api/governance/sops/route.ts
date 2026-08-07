import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { SOP_FAILURE_STATUS, saveSop } from "@/lib/governance/sop-service";
import { sopSchema } from "@/lib/validators";

export const runtime = "nodejs";

/** Creates an SOP, or publishes a new immutable version of an existing one. */
export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = sopSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid SOP details" }, { status: 400 });
    }

    const result = await saveSop({
      actor,
      sopId: parsed.data.sopId,
      reference: parsed.data.reference,
      title: parsed.data.title,
      summary: parsed.data.summary,
      content: parsed.data.content,
      changeNote: parsed.data.changeNote,
      ownerId: parsed.data.ownerId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: SOP_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(
      { ok: true, sopId: result.sop.id, version: result.version },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/governance/sops] Failed to save SOP.", error);
    return NextResponse.json({ error: "Unable to save the SOP right now." }, { status: 500 });
  }
}
