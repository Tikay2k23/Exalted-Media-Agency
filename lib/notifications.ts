import {
  type ActivityEntityType,
  type NotificationType,
  NotificationUrgency,
  type Prisma,
} from "@prisma/client";

import { ACTION_TYPES } from "@/lib/notifications-view";
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

  /*
   * Drop anything the recipient already has waiting.
   *
   * The same event fires more than once in ordinary use - a weekly report
   * saved twice, a nightly sweep that re-reports the same overdue item - and
   * each one used to become another row. The result was eight separate pairs
   * of an identical "Weekly report from EOD Ada" sitting unread, which is how
   * a notification list stops being read at all.
   *
   * Only unread rows suppress a new one. Once somebody has dealt with it, the
   * same thing happening again is genuinely new and should say so.
   */
  const deduped = await withoutExistingDuplicates(inputs);

  if (!deduped.length) {
    return 0;
  }

  // Never notify someone about their own action - it is noise, and it trains
  // people to ignore the notification list.
  const rows: Prisma.NotificationCreateManyInput[] = deduped.map((input) => ({
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

/**
 * Removes inputs that already exist, unread, for the same recipient.
 *
 * Matched on recipient, type, the record it points at, AND the title.
 *
 * The title has to be in the key. Without it, "Metro South is now red" was
 * suppressed because an earlier "Metro South is now yellow" about the same
 * client was still unread - the same type and the same record, but a
 * completely different fact, and the more serious of the two. A repeat is the
 * identical sentence arriving twice, not any two events of a kind.
 *
 * A lookup failure lets everything through: a duplicate is an annoyance, and a
 * dropped critical alert is not.
 */
async function withoutExistingDuplicates(inputs: NotificationInput[]) {
  try {
    const existing = await prisma.notification.findMany({
      where: {
        readAt: null,
        recipientId: { in: [...new Set(inputs.map((input) => input.recipientId))] },
        type: { in: [...new Set(inputs.map((input) => input.type))] },
      },
      select: { recipientId: true, type: true, entityId: true, title: true },
    });

    const keyOf = (row: {
      recipientId: string;
      type: string;
      entityId?: string | null;
      title: string;
    }) => `${row.recipientId}|${row.type}|${row.entityId ?? ""}|${row.title}`;

    const seen = new Set(existing.map(keyOf));

    return inputs.filter((input) => {
      const key = keyOf(input);

      if (seen.has(key)) return false;

      // Also guards against repeats inside a single batch.
      seen.add(key);

      return true;
    });
  } catch (error) {
    console.error("[notifications] Duplicate check failed; writing all.", error);
    return inputs;
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

/**
 * What the bell badge shows.
 *
 * Unread things that are critical or need doing - not every unread row ever
 * written. On this workspace the difference is eighty-five against six: a
 * badge in the eighties is wallpaper, and nobody clears it, so nobody reads
 * any of it.
 *
 * The type list comes from lib/notifications-view.ts, the same list the
 * interface sorts and tabs by, so the badge and the Action Required tab cannot
 * disagree about what counts.
 */
export async function getUnreadNotificationCount(recipientId: string) {
  try {
    return await prisma.notification.count({
      where: {
        recipientId,
        readAt: null,
        OR: [
          { urgency: NotificationUrgency.CRITICAL },
          { type: { in: ACTION_TYPES as unknown as NotificationType[] } },
        ],
      },
    });
  } catch (error) {
    console.error("[notifications] Failed to count unread notifications.", error);
    return 0;
  }
}

/** Every unread row, for the popup header and the full history page. */
export async function getTotalUnreadCount(recipientId: string) {
  try {
    return await prisma.notification.count({ where: { recipientId, readAt: null } });
  } catch (error) {
    console.error("[notifications] Failed to count unread notifications.", error);
    return 0;
  }
}
