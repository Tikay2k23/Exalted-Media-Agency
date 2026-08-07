import { NextResponse } from "next/server";

import { LAUNCH_FAILURE_STATUS } from "@/app/api/clients/[id]/launches/route";
import { getServerAuthSession } from "@/lib/auth";
import { loadAuthContext } from "@/lib/authz";
import { recordMonitoringCheck } from "@/lib/launch/launch-service";
import { monitoringCheckSchema } from "@/lib/validators";

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

    const parsed = monitoringCheckSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid monitoring payload" },
        { status: 400 },
      );
    }

    const result = await recordMonitoringCheck({
      actor,
      checkId: id,
      result: parsed.data.result,
      observations: parsed.data.observations,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, code: result.code },
        { status: LAUNCH_FAILURE_STATUS[result.code] },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/monitoring-checks/:id] Failed to record check.", error);
    return NextResponse.json(
      { error: "Unable to record this check right now." },
      { status: 500 },
    );
  }
}
