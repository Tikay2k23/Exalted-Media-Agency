import { NextResponse } from "next/server";

import { resourceActor } from "@/lib/governance/resource-auth";
import { searchLinkableResources } from "@/lib/governance/resource-service";

export const runtime = "nodejs";

/** Existing resources that could be linked to a SOP, minus the ones already on it. */
export async function GET(request: Request) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const excludeSopId = url.searchParams.get("excludeSopId");

  if (!excludeSopId) {
    return NextResponse.json({ error: "An excludeSopId is required." }, { status: 400 });
  }

  const resources = await searchLinkableResources({
    query: url.searchParams.get("q") ?? undefined,
    excludeSopId,
  });

  return NextResponse.json({ resources });
}
