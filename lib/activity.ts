import type { ActivityEntityType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

interface LogActivityInput {
  actorId?: string | null;
  action: string;
  entityType: ActivityEntityType;
  entityId: string;
  metadataJson?: Record<string, unknown>;
}

export async function logActivity({
  actorId,
  action,
  entityType,
  entityId,
  metadataJson,
}: LogActivityInput) {
  try {
    await prisma.activityLog.create({
      data: {
        actorId: actorId ?? undefined,
        action,
        entityType,
        entityId,
        metadataJson: metadataJson as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    console.error("[activity] Failed to write activity log.", error);
  }
}
