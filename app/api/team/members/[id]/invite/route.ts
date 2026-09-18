import { TeamRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { canManageDepartment, departmentForSeat } from "@/lib/team/departments";
import { issueInvite } from "@/lib/team/invites";
import { teamActor } from "@/lib/team/team-auth";

export const runtime = "nodejs";

/**
 * Issues a fresh invitation link for a member, replacing any earlier one.
 *
 * For when the first link was lost, expired, or went to the wrong place.
 * Scoped like every other team action: only somebody who manages the member's
 * department may do it, and never for an inactive member.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await teamActor();

  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  const member = await prisma.user.findFirst({
    where: { id, deletedAt: null, teamRole: TeamRole.DEPARTMENT_MEMBER },
    select: { id: true, name: true, isActive: true, manager: { select: { teamRole: true } } },
  });

  const dept = departmentForSeat(member?.manager?.teamRole);

  if (!member || !dept || !canManageDepartment(auth.actor, dept.key)) {
    return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  }

  if (!member.isActive) {
    return NextResponse.json(
      { error: "Reactivate this member before inviting them to log in." },
      { status: 400 },
    );
  }

  const invite = await issueInvite(member.id, new URL(request.url).origin);

  await logActivity({
    actorId: auth.actor.id,
    action: `${auth.actor.name} issued a login invitation for ${member.name}`,
    entityType: "USER",
    entityId: member.id,
  });

  return NextResponse.json({ ok: true, invite });
}
