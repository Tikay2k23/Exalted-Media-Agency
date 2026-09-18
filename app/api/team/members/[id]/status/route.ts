import { NextResponse } from "next/server";
import { z } from "zod";

import { MEMBER_STATUSES } from "@/lib/team/departments";
import { teamActor } from "@/lib/team/team-auth";
import { TEAM_FAILURE_STATUS, setMemberStatus } from "@/lib/team/team-service";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(MEMBER_STATUSES),
  /** Optional: hand this member's unfinished work to somebody in the department. */
  reassignToId: z.string().max(60).optional().nullable(),
});

/**
 * Active, on leave, or inactive - never a delete.
 *
 * Inactive ends the member's access at once: login refuses them, and the
 * session check re-reads isActive on every request.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await teamActor();

  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a status." }, { status: 400 });
  }

  const result = await setMemberStatus(auth.actor, id, parsed.data.status, parsed.data.reassignToId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: TEAM_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true, reassigned: result.reassigned });
}
