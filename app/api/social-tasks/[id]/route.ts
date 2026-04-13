import { ActivityEntityType } from "@prisma/client";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  canAccessAssignedRecord,
  canViewAllAgencyData,
} from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { socialTaskUpdateSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  const { id } = await params;

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const task = await prisma.socialMediaTask.findUnique({
    where: { id },
    include: {
      client: true,
    },
  });

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const canEdit =
    canViewAllAgencyData(session.user.role) ||
    canAccessAssignedRecord(
      session.user.role,
      session.user.id,
      task.assignedUserId,
    ) ||
    canAccessAssignedRecord(
      session.user.role,
      session.user.id,
      task.client.assignedUserId,
    );

  if (!canEdit) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json();
  const parsed = socialTaskUpdateSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid fulfillment payload" }, { status: 400 });
  }

  if (parsed.data.completedPosts > parsed.data.plannedPosts) {
    return NextResponse.json(
      { error: "Completed posts cannot exceed planned posts." },
      { status: 400 },
    );
  }

  const updatedTask = await prisma.socialMediaTask.update({
    where: { id },
    data: {
      platform: parsed.data.platform,
      plannedPosts: parsed.data.plannedPosts,
      completedPosts: parsed.data.completedPosts,
      dueDate: new Date(parsed.data.dueDate),
      status: parsed.data.status,
      assignedUserId: parsed.data.assignedUserId || null,
    },
  });

  await logActivity({
    actorId: session.user.id,
    action: `Updated ${task.client.companyName} ${updatedTask.platform.replaceAll("_", " ")} posting progress`,
    entityType: ActivityEntityType.SOCIAL_TASK,
    entityId: updatedTask.id,
  });

  return NextResponse.json(updatedTask);
}
