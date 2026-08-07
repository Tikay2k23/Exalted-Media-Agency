import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_PAGE_SIZE = 50;

const updateSchema = z.union([
  z.object({ action: z.literal("markRead"), notificationId: z.string().min(1) }),
  z.object({ action: z.literal("markAllRead") }),
]);

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

    const [notifications, unreadCount] = await Promise.all([
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
      prisma.notification.count({
        where: { recipientId: session.user.id, readAt: null },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
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

    const updated = await markNotificationRead(
      parsed.data.notificationId,
      session.user.id,
    );

    if (!updated) {
      // Covers "already read" and "not yours" with the same response, so this
      // cannot be used to probe for other users' notification ids.
      return NextResponse.json({ ok: true, updated: 0 });
    }

    return NextResponse.json({ ok: true, updated: 1 });
  } catch (error) {
    console.error("[api/notifications] Failed to update notifications.", error);
    return NextResponse.json(
      { error: "Unable to update notifications right now." },
      { status: 500 },
    );
  }
}
