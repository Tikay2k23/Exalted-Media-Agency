import { NextResponse } from "next/server";
import { z } from "zod";

import { resourceActor } from "@/lib/governance/resource-auth";
import {
  RESOURCE_FAILURE_STATUS,
  linkResourceToSop,
  unlinkResourceFromSop,
} from "@/lib/governance/resource-service";

export const runtime = "nodejs";

const schema = z.object({ sopId: z.string().min(1) });

/** Links this resource to a SOP. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "A sopId is required." }, { status: 400 });
  }

  const result = await linkResourceToSop({ actor: auth.actor, resourceId: id, sopId: parsed.data.sopId });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: RESOURCE_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

/**
 * Removes this resource from one SOP.
 *
 * Unlinking, not deleting: the resource and its other links are untouched. The
 * SOP is named in the body rather than assumed, so the caller cannot remove the
 * wrong link by accident.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resourceActor();

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "A sopId is required." }, { status: 400 });
  }

  const result = await unlinkResourceFromSop({
    actor: auth.actor,
    resourceId: id,
    sopId: parsed.data.sopId,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: RESOURCE_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true });
}
