import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import {
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_PAGE_SIZE = 50;

const updateSchema = z.union([
  z.object({
    action: z.literal("markRead"),
    // A group folds several rows into one line, so acting on it has to act on
    // all of them - otherwise the count drops by one and the row stays.
    notificationId: z.string().min(1),
    notificationIds: z.array(z.string().min(1)).max(200).optional(),
  }),
  z.object({
    action: z.literal("markUnread"),
    notificationId: z.string().min(1),
    notificationIds: z.array(z.string().min(1)).max(200).optional(),
  }),
  z.object({
    action: z.literal("dismiss"),
    notificationId: z.string().min(1),
    notificationIds: z.array(z.string().min(1)).max(200).optional(),
  }),
  z.object({ action: z.literal("markAllRead") }),
]);

/**
 * The name of the thing each notification is about.
 *
 * Looked up per entity type in one query each rather than per row, so a
 * hundred approval requests against one client cost a single lookup. A record
 * that has since been deleted simply has no subject and the row still reads
 * fine without it.
 */
async function resolveSubjects(
  rows: { entityType: string | null; entityId: string | null }[],
) {
  const idsByType = new Map<string, Set<string>>();

  for (const row of rows) {
    if (!row.entityType || !row.entityId) continue;

    const bucket = idsByType.get(row.entityType) ?? new Set<string>();

    bucket.add(row.entityId);
    idsByType.set(row.entityType, bucket);
  }

  const subjects = new Map<string, string>();
  const key = (type: string, id: string) => `${type}:${id}`;

  const clientIds = idsByType.get("CLIENT") ?? idsByType.get("PIPELINE");

  if (clientIds?.size) {
    const clients = await prisma.client.findMany({
      where: { id: { in: [...clientIds] } },
      select: { id: true, companyName: true },
    });

    for (const client of clients) {
      subjects.set(key("CLIENT", client.id), client.companyName);
      subjects.set(key("PIPELINE", client.id), client.companyName);
    }
  }

  const taskIds = idsByType.get("EMPLOYEE_TASK");

  if (taskIds?.size) {
    const tasks = await prisma.employeeTask.findMany({
      where: { id: { in: [...taskIds] } },
      select: { id: true, title: true },
    });

    for (const task of tasks) {
      subjects.set(key("EMPLOYEE_TASK", task.id), task.title);
    }
  }

  const leadIds = idsByType.get("LEAD");

  if (leadIds?.size) {
    const leads = await prisma.lead.findMany({
      where: { id: { in: [...leadIds] } },
      select: { id: true, businessName: true },
    });

    for (const lead of leads) {
      subjects.set(key("LEAD", lead.id), lead.businessName);
    }
  }

  const userIds = idsByType.get("USER");

  if (userIds?.size) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true },
    });

    for (const user of users) {
      subjects.set(key("USER", user.id), user.name);
    }
  }

  return (entityType: string | null, entityId: string | null) =>
    entityType && entityId ? (subjects.get(key(entityType, entityId)) ?? null) : null;
}

export async function GET(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const requestedLimit = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_PAGE_SIZE)
      : 20;

    // Always scoped to the signed-in user. There is no path here to read
    // somebody else's notifications.
    const where = {
      recipientId: session.user.id,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [notifications, unreadCount, totalUnread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          type: true,
          urgency: true,
          title: true,
          body: true,
          href: true,
          entityType: true,
          entityId: true,
          readAt: true,
          createdAt: true,
        },
      }),
      getUnreadNotificationCount(session.user.id),
      prisma.notification.count({
        where: { recipientId: session.user.id, readAt: null },
      }),
    ]);

    const subjectFor = await resolveSubjects(notifications);

    return NextResponse.json({
      notifications: notifications.map((notification) => ({
        ...notification,
        subject: subjectFor(notification.entityType, notification.entityId),
      })),
      // What the bell shows: unread things that are critical or need doing.
      unreadCount,
      // Every unread row, so the popup can say how many it is not showing.
      totalUnread,
    });
  } catch (error) {
    console.error("[api/notifications] Failed to load notifications.", error);
    return NextResponse.json(
      { error: "Unable to load notifications right now." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerAuthSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = updateSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid notification payload" }, { status: 400 });
    }

    if (parsed.data.action === "markAllRead") {
      const count = await markAllNotificationsRead(session.user.id);
      return NextResponse.json({ ok: true, updated: count });
    }

    // Every branch below is scoped by recipientId, so one user can never
    // touch another's rows - and an id that is not theirs returns the same
    // shape as one that is already handled, so this cannot be used to probe.
    const ids = parsed.data.notificationIds?.length
      ? parsed.data.notificationIds
      : [parsed.data.notificationId];

    if (parsed.data.action === "dismiss") {
      const result = await prisma.notification.deleteMany({
        where: { id: { in: ids }, recipientId: session.user.id },
      });

      return NextResponse.json({ ok: true, updated: result.count });
    }

    if (parsed.data.action === "markUnread") {
      const result = await prisma.notification.updateMany({
        where: { id: { in: ids }, recipientId: session.user.id },
        data: { readAt: null },
      });

      return NextResponse.json({ ok: true, updated: result.count });
    }

    if (ids.length > 1) {
      const result = await prisma.notification.updateMany({
        where: { id: { in: ids }, recipientId: session.user.id, readAt: null },
        data: { readAt: new Date() },
      });

      return NextResponse.json({ ok: true, updated: result.count });
    }

    const updated = await markNotificationRead(ids[0], session.user.id);

    return NextResponse.json({ ok: true, updated: updated ? 1 : 0 });
  } catch (error) {
    console.error("[api/notifications] Failed to update notifications.", error);
    return NextResponse.json(
      { error: "Unable to update notifications right now." },
      { status: 500 },
    );
  }
}
