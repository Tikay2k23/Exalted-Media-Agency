import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { createDefect } from "@/lib/quality/defect-service";
import { defectSchema } from "@/lib/validators";

export const runtime = "nodejs";

export const QUALITY_FAILURE_STATUS = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 400,
  /** Refusing self-verification is a policy decision, not a bad request. */
  SELF_VERIFICATION: 409,
  ALREADY_CLOSED: 409,
} as const;

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

    const parsed = defectSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid defect details" }, { status: 400 });
    }

    const result = await createDefect({ actor, clientId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: QUALITY_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json(
      { ok: true, reference: result.defect.reference },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/clients/:id/defects] Failed to raise defect.", error);
    return NextResponse.json(
      { error: "Unable to raise this defect right now." },
      { status: 500 },
    );
  }
}
