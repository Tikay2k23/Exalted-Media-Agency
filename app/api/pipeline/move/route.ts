import { ActivityEntityType } from "@prisma/client";
import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canMovePipeline } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { pipelineMoveSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canMovePipeline(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json();
  const parsed = pipelineMoveSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid pipeline payload" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { id: parsed.data.clientId },
    include: {
      currentStage: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (client.currentStageId === parsed.data.stageId) {
    return NextResponse.json({ ok: true });
  }

  const nextStage = await prisma.pipelineStage.findUnique({
    where: { id: parsed.data.stageId },
  });

  if (!nextStage) {
    return NextResponse.json({ error: "Stage not found" }, { status: 404 });
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      currentStageId: parsed.data.stageId,
    },
  });

  await prisma.clientStageHistory.create({
    data: {
      clientId: client.id,
      fromStageId: client.currentStageId,
      toStageId: parsed.data.stageId,
      changedById: session.user.id,
      note: parsed.data.note || `Moved from ${client.currentStage.name} to ${nextStage.name}.`,
    },
  });

  await logActivity({
    actorId: session.user.id,
    action: `Moved ${client.companyName} into ${nextStage.name}`,
    entityType: ActivityEntityType.PIPELINE,
    entityId: client.id,
  });

  return NextResponse.json({ ok: true });
}
