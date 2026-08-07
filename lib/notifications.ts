import type {
  ActivityEntityType,
  NotificationType,
  NotificationUrgency,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export interface NotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  urgency?: NotificationUrgency;
  entityType?: ActivityEntityType | null;
  entityId?: string | null;
  href?: string | null;
}

/**
 * Writes notifications.
 *
 * Delivery failures never break the action that triggered them: a work item
 * must still be created even if its notification cannot be written. Failures
 * are logged rather than thrown.
 */
export async function createNotifications(inputs: NotificationInput[]) {
  if (!inputs.length) {
    return 0;
  }

  // Never notify someone about their own action - it is noise, and it trains
  // people to ignore the notification list.
  const rows: Prisma.NotificationCreateManyInput[] = inputs.map((input) => ({
    recipientId: input.recipientId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    urgency: input.urgency ?? "NORMAL",
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    href: input.href ?? null,
  }));

  try {
    const result = await prisma.notification.createMany({ data: rows });
    return result.count;
  } catch (error) {
    // createMany is atomic, so a single bad recipient - someone deactivated
    // between building this batch and writing it - would discard everyone
    // else's notification too. A critical alert must not disappear because of
    // an unrelated row, so fall back to writing them individually.
    console.error(
      "[notifications] Batch insert failed; retrying individually.",
      error,
    );

    let written = 0;

    for (const row of rows) {
      try {
        await prisma.notification.create({ data: row });
        written += 1;
      } catch (rowError) {
        console.error(
          `[notifications] Dropped notification for recipient ${row.recipientId}.`,
          rowError,
        );
      }
    }

    return written;
  }
}

export async function createNotification(input: NotificationInput) {
  return createNotifications([input]);
}

/**
 * Removes duplicate recipients and drops the acting user, so a person is never
 * notified about something they just did themselves.
 */
export function resolveRecipients(
  candidateIds: (string | null | undefined)[],
  actorId: string,
): string[] {
  const recipients = new Set<string>();

  for (const candidateId of candidateIds) {
    if (candidateId && candidateId !== actorId) {
      recipients.add(candidateId);
    }
  }

  return [...recipients];
}

export async function markNotificationRead(notificationId: string, recipientId: string) {
  // Scoped by recipient so one user cannot mark another user's notification read.
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, recipientId, readAt: null },
    data: { readAt: new Date() },
  });

  return result.count > 0;
}

export async function markAllNotificationsRead(recipientId: string) {
  const result = await prisma.notification.updateMany({
    where: { recipientId, readAt: null },
    data: { readAt: new Date() },
  });

  return result.count;
}

export async function getUnreadNotificationCount(recipientId: string) {
  try {
    return await prisma.notification.count({
      where: { recipientId, readAt: null },
    });
  } catch (error) {
    console.error("[notifications] Failed to count unread notifications.", error);
    return 0;
  }
}
