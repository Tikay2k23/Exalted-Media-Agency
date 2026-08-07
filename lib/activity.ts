import type { ActivityEntityType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

interface LogActivityInput {
  actorId?: string | null;
  action: string;
  entityType: ActivityEntityType;
  entityId: string;
  metadataJson?: Record<string, unknown>;
  /** Field-level change auditing. */
  fieldName?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  /** Request origin, when the caller has it. */
  origin?: string | null;
}

/**
 * Appends to the audit trail.
 *
 * There is deliberately no update or delete counterpart: history that can be
 * edited is not evidence. Write failures are logged rather than thrown so a
 * failed audit write never rolls back the action it was describing - the
 * action itself is still the source of truth.
 */
export async function logActivity({
  actorId,
  action,
  entityType,
  entityId,
  metadataJson,
  fieldName,
  previousValue,
  newValue,
  origin,
}: LogActivityInput) {
  try {
    await prisma.activityLog.create({
      data: {
        actorId: actorId ?? undefined,
        action,
        entityType,
        entityId,
        metadataJson: metadataJson as Prisma.InputJsonValue | undefined,
        fieldName: fieldName ?? null,
        previousValue: previousValue ?? null,
        newValue: newValue ?? null,
        origin: origin ?? null,
      },
    });
  } catch (error) {
    console.error("[activity] Failed to write activity log.", error);
  }
}
