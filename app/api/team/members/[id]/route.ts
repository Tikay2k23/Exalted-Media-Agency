import { EmploymentType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { DEPARTMENT_KEYS } from "@/lib/team/departments";
import { teamActor } from "@/lib/team/team-auth";
import { TEAM_FAILURE_STATUS, getMemberProfile, updateMember } from "@/lib/team/team-service";

export const runtime = "nodejs";

/** One member's profile: details, task counts, clients and recent activity. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await teamActor();

  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const result = await getMemberProfile(auth.actor, id);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: TEAM_FAILURE_STATUS[result.code] });
  }

  return NextResponse.json({ profile: result.profile });
}

const optionalText = (max: number) => z.string().max(max).optional().nullable();

const patchSchema = z.object({
  firstName: z.string().min(1).max(60).optional(),
  lastName: z.string().min(1).max(60).optional(),
  phone: optionalText(40),
  avatarUrl: z
    .string()
    .max(2_800_000)
    .refine((value) => value === "" || value.startsWith("data:image/"), "Not an image.")
    .optional()
    .nullable(),
  departmentKey: z.enum(DEPARTMENT_KEYS).optional(),
  reportsToId: optionalText(60),
  jobTitle: optionalText(80),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  timezone: optionalText(60),
  workingHours: optionalText(80),
  startDate: optionalText(40),
  notes: optionalText(2000),
});

/** Edits a member. Moving departments is refused here for anyone but the owner. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await teamActor();

  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid details." },
      { status: 400 },
    );
  }

  const result = await updateMember(auth.actor, id, parsed.data);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: TEAM_FAILURE_STATUS[result.code] },
    );
  }

  return NextResponse.json({ ok: true });
}
