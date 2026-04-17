import { ActivityEntityType, Department, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canManageUsers } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { userFormSchema } from "@/lib/validators";

export const runtime = "nodejs";

const userUpdateSchema = z.object({
  id: z.string().min(1),
  role: z.nativeEnum(Role),
  department: z.nativeEnum(Department),
  jobTitle: z.string().max(80).optional().or(z.literal("")),
  weeklyCapacityHours: z.coerce.number().int().min(1).max(80),
  isActive: z.boolean(),
});

export async function POST(request: Request) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json();
  const parsed = userFormSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid user payload" }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email: parsed.data.email.toLowerCase(),
    },
    select: {
      id: true,
    },
  });

  if (existingUser) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  }

  const passwordHash = await hash(parsed.data.password, 12);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      department: parsed.data.department,
      jobTitle: parsed.data.jobTitle || null,
      weeklyCapacityHours: parsed.data.weeklyCapacityHours,
      passwordHash,
      isActive: parsed.data.isActive,
    },
  });

  await logActivity({
    actorId: session.user.id,
    action: `Created user ${user.name}`,
    entityType: ActivityEntityType.USER,
    entityId: user.id,
  });

  return NextResponse.json(user, { status: 201 });
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageUsers(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = userUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid update payload" }, { status: 400 });
    }

    if (parsed.data.id === session.user.id && (!parsed.data.isActive || parsed.data.role !== Role.ADMIN)) {
      return NextResponse.json(
        { error: "You cannot deactivate or remove admin access from the account you are currently using." },
        { status: 400 },
      );
    }

    const user = await prisma.user.update({
      where: { id: parsed.data.id },
      data: {
        role: parsed.data.role,
        department: parsed.data.department,
        jobTitle: parsed.data.jobTitle || null,
        weeklyCapacityHours: parsed.data.weeklyCapacityHours,
        isActive: parsed.data.isActive,
      },
    });

    await logActivity({
      actorId: session.user.id,
      action: `Updated user ${user.name}`,
      entityType: ActivityEntityType.USER,
      entityId: user.id,
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("[api/admin/users] Failed to update user.", error);
    return NextResponse.json({ error: "Unable to update this user right now." }, { status: 500 });
  }
}
