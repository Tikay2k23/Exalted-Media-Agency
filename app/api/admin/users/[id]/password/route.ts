import { ActivityEntityType } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { loadAuthContext } from "@/lib/authz";
import { getServerAuthSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Setting a user's password, for an administrator.
 *
 * This exists because there is no other way in. Passwords are stored as
 * one-way hashes, so no screen can show an existing one, and the app has no
 * mailer, so "Forgot password" cannot deliver a reset link. Without this, an
 * account whose password is lost is simply lost. So an admin sets a new one
 * here and hands it over out of band.
 *
 * It sets, it never reveals: the request carries a new password in, the
 * response carries nothing sensitive back, and the activity log records that a
 * reset happened without recording what it was.
 *
 * Guarded on users.manage through the resolved context rather than the access
 * tier alone. The tier-only check the rest of this area uses would refuse an
 * Agency Owner who happens to sit on a lower tier - wrong on a normal screen,
 * and wrong in the more dangerous direction on one that can change anybody's
 * credentials.
 */
const schema = z.object({
  password: z
    .string()
    .min(8, "A password must be at least 8 characters.")
    .max(200, "That password is too long."),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const actor = await loadAuthContext(session.user.id);

    if (!actor || !can(actor, "users.manage")) {
      return NextResponse.json(
        { error: "You do not have permission to reset passwords." },
        { status: 403 },
      );
    }

    const { id } = await params;

    const parsed = schema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid password." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(parsed.data.password, 12) },
    });

    /*
     * Records that a reset happened and who did it. Never the password itself,
     * and not even into the change fields - a value nobody should see does not
     * belong in an audit row either.
     */
    await logActivity({
      actorId: actor.id,
      action:
        actor.id === user.id
          ? `Reset their own password`
          : `Reset the password for ${user.name}`,
      entityType: ActivityEntityType.USER,
      entityId: user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/admin/users/:id/password] Failed to reset password.", error);
    return NextResponse.json(
      { error: "Could not reset the password right now. Nothing was changed." },
      { status: 500 },
    );
  }
}
