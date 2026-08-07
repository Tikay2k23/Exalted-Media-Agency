import { ActivityEntityType } from "@prisma/client";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canManageClients } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clientFormSchema } from "@/lib/validators";
import { FULFILLMENT_PIPELINE_ID } from "@/lib/workspace-defaults";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!canManageClients(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = clientFormSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid client payload" }, { status: 400 });
    }

    // The stage must belong to the client journey. Accepting any stage id lets
    // an account be created on the sales pipeline, where the journey rules do
    // not apply and the move guard would then refuse to bring it back.
    const stage = await prisma.pipelineStage.findFirst({
      where: {
        id: parsed.data.currentStageId,
        pipelineId: FULFILLMENT_PIPELINE_ID,
        isDeprecated: false,
      },
      select: { id: true },
    });

    if (!stage) {
      return NextResponse.json(
        { error: "That stage is not a current client journey stage." },
        { status: 400 },
      );
    }

    const client = await prisma.client.create({
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

    await prisma.clientStageHistory.create({
      data: {
        clientId: client.id,
        toStageId: parsed.data.currentStageId,
        changedById: session.user.id,
        note: "Client created in the pipeline.",
      },
    });

    await logActivity({
      actorId: session.user.id,
      action: `Created client ${client.companyName}`,
      entityType: ActivityEntityType.CLIENT,
      entityId: client.id,
    });

    return NextResponse.json(client, { status: 201 });
  } catch (error) {
    console.error("[api/clients] Failed to create client.", error);
    return NextResponse.json({ error: "Unable to create this client right now." }, { status: 500 });
  }
}
