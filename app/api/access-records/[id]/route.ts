import { NextResponse } from "next/server";

import { ACCESS_FAILURE_STATUS } from "@/app/api/clients/[id]/access/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { updateAccessRecord } from "@/lib/security/access-service";
import { accessRecordUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PATCH(
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
    const parsed = accessRecordUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid access details" }, { status: 400 });
    }

    const result = await updateAccessRecord({ actor, recordId: id, data: parsed.data });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code, field: result.field },
        { status: ACCESS_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/access-records/:id] Failed to update access record.", error);
    return NextResponse.json(
      { error: "Unable to update this access record right now." },
      { status: 500 },
    );
  }
}
