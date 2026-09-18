import { EmploymentType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { DEPARTMENT_KEYS, MEMBER_STATUSES } from "@/lib/team/departments";
import { issueInvite } from "@/lib/team/invites";
import { teamActor } from "@/lib/team/team-auth";
import { TEAM_FAILURE_STATUS, addMember, listDepartments } from "@/lib/team/team-service";

export const runtime = "nodejs";

/** The departments this person manages, with their people and workload. */
export async function GET() {
  const auth = await teamActor();

  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json({ departments: await listDepartments(auth.actor) });
}

const optionalText = (max: number) => z.string().max(max).optional().nullable();

const memberSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().min(3).max(160),
  phone: optionalText(40),
  // Same shape the profile form accepts: a data: image URL, already resized.
  avatarUrl: z
    .string()
    .max(2_800_000)
    .refine((value) => value === "" || value.startsWith("data:image/"), "Not an image.")
    .optional()
    .nullable(),
  departmentKey: z.enum(DEPARTMENT_KEYS),
  reportsToId: optionalText(60),
  jobTitle: optionalText(80),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  timezone: optionalText(60),
  workingHours: optionalText(80),
  startDate: optionalText(40),
  status: z.enum(MEMBER_STATUSES).optional(),
  notes: optionalText(2000),
  sendInvite: z.boolean().optional(),
});

/**
 * Adds a team member.
 *
 * With sendInvite, also returns a one-time link for them to set a password.
 * This application sends no email, so the link is handed back to whoever added
 * them to pass on - it is not "sent" anywhere, and the response says so.
 */
export async function POST(request: Request) {
  const auth = await teamActor();

  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = memberSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid team member details." },
      { status: 400 },
    );
  }

  const { sendInvite, ...input } = parsed.data;
  const result = await addMember(auth.actor, input);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: TEAM_FAILURE_STATUS[result.code] },
    );
  }

  const invite =
    sendInvite && input.status !== "INACTIVE"
      ? await issueInvite(result.memberId, new URL(request.url).origin)
      : null;

  return NextResponse.json({ ok: true, memberId: result.memberId, invite }, { status: 201 });
}
