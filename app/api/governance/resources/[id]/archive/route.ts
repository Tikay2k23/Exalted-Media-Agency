import { NextResponse } from "next/server";

import { resourceActor } from "@/lib/governance/resource-auth";
import { RESOURCE_FAILURE_STATUS, archiveResource } from "@/lib/governance/resource-service";

export const runtime = "nodejs";

/** Archives a resource: it drops out of the active lists but is not deleted. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const result = await archiveResource({ actor: auth.actor, resourceId: id });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: RESOURCE_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true });
}
