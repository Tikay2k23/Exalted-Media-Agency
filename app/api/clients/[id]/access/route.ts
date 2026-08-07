import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { createAccessRecord } from "@/lib/security/access-service";
import { accessRecordSchema } from "@/lib/validators";

export const runtime = "nodejs";

export const ACCESS_FAILURE_STATUS = {
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 409,
  // A rejected credential is the caller's mistake to correct, not a server
  // fault, and the message explains what to do instead.
  CREDENTIAL_REJECTED: 422,
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

    const payload = await request.json();
    const parsed = accessRecordSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid access details" }, { status: 400 });
    }

    const result = await createAccessRecord({ actor, clientId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code, field: result.field },
        { status: ACCESS_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("[api/clients/:id/access] Failed to add access record.", error);
    return NextResponse.json(
      { error: "Unable to save this access record right now." },
      { status: 500 },
    );
  }
}
