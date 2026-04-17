import { ActivityEntityType } from "@prisma/client";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { profileUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = profileUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile payload" }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },
    select: {
      id: true,
    },
  });

  if (existingUser && existingUser.id !== session.user.id) {
    return NextResponse.json({ error: "This email address is already in use." }, { status: 409 });
  }

  const user = await prisma.user.update({
    where: {
      id: session.user.id,
    },
    data: {
      name: parsed.data.name,
      email: normalizedEmail,
      jobTitle: parsed.data.jobTitle || null,
      ...(parsed.data.avatarUrl !== undefined
        ? { avatarUrl: parsed.data.avatarUrl || null }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      jobTitle: true,
      weeklyCapacityHours: true,
      avatarUrl: true,
    },
  });

  await logActivity({
    actorId: session.user.id,
    action: "Updated account profile",
    entityType: ActivityEntityType.USER,
    entityId: user.id,
  });

  return NextResponse.json(user);
}
