import { ActivityEntityType } from "@prisma/client";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canAccessAssignedRecord, canManageClients } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clientFormSchema, clientStatusUpdateSchema } from "@/lib/validators";

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

  const client = await prisma.client.findUnique({
    where: { id },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (
    !canManageClients(session.user.role) &&
    !canAccessAssignedRecord(
      session.user.role,
      session.user.id,
      client.assignedUserId,
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json();
  const isObjectPayload = typeof payload === "object" && payload !== null;
  const isStatusOnlyPayload =
    isObjectPayload &&
    Object.keys(payload).length === 1 &&
    "status" in payload;

  if (isStatusOnlyPayload) {
    const parsed = clientStatusUpdateSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid status payload" }, { status: 400 });
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: {
        status: parsed.data.status,
      },
    });

    await logActivity({
      actorId: session.user.id,
      action: `Updated ${updatedClient.companyName} status to ${parsed.data.status.replaceAll("_", " ")}`,
      entityType: ActivityEntityType.CLIENT,
      entityId: updatedClient.id,
    });

    return NextResponse.json(updatedClient);
  }

  if (!canManageClients(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = clientFormSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid client payload" }, { status: 400 });
  }

  const [stage, assignee] = await Promise.all([
    prisma.pipelineStage.findUnique({
      where: { id: parsed.data.currentStageId },
      select: { id: true },
    }),
    parsed.data.assignedUserId
      ? prisma.user.findUnique({
          where: { id: parsed.data.assignedUserId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!stage) {
    return NextResponse.json({ error: "Pipeline stage not found" }, { status: 404 });
  }

  if (parsed.data.assignedUserId && !assignee) {
    return NextResponse.json({ error: "Assigned teammate not found" }, { status: 404 });
  }

  const updatedClient = await prisma.client.update({
    where: { id },
    data: {
      clientName: parsed.data.clientName,
      companyName: parsed.data.companyName,
      contactEmail: parsed.data.contactEmail.toLowerCase(),
      contactPhone: parsed.data.contactPhone || null,
      assignedUserId: parsed.data.assignedUserId || null,
      status: parsed.data.status,
      serviceType: parsed.data.serviceType,
      currentStageId: parsed.data.currentStageId,
      notes: parsed.data.notes || null,
    },
  });

  if (client.currentStageId !== parsed.data.currentStageId) {
    await prisma.clientStageHistory.create({
      data: {
        clientId: updatedClient.id,
        fromStageId: client.currentStageId,
        toStageId: parsed.data.currentStageId,
        changedById: session.user.id,
        note: "Client stage updated from the client profile.",
      },
    });
  }

  await logActivity({
    actorId: session.user.id,
    action: `Updated client ${updatedClient.companyName}`,
    entityType: ActivityEntityType.CLIENT,
    entityId: updatedClient.id,
  });

  return NextResponse.json(updatedClient);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuthSession();
  const { id } = await params;

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageClients(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const client = await prisma.client.findUnique({
    where: { id },
    select: {
      id: true,
      companyName: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  await prisma.client.delete({
    where: { id },
  });

  await logActivity({
    actorId: session.user.id,
    action: `Deleted client ${client.companyName}`,
    entityType: ActivityEntityType.CLIENT,
    entityId: client.id,
  });

  return NextResponse.json({ success: true });
}
