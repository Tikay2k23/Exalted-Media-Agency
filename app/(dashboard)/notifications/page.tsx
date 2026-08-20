import { Bell } from "lucide-react";
import { redirect } from "next/navigation";

import { NotificationHistory } from "@/components/layout/notification-history";
import { loadAuthContext } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Notifications",
};

/**
 * The full history behind the popup.
 *
 * The popup is the primary experience and deliberately shows only what needs
 * attention; this is where everything else lives, including what has already
 * been read. It reuses the same classification and grouping the popup does, so
 * the two can never disagree about what something is.
 */
export default async function NotificationsPage() {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    redirect("/login");
  }

  const notifications = await prisma.notification.findMany({
    where: { recipientId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 200,
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
  });

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-950">
          <Bell className="h-5 w-5 text-slate-400" aria-hidden />
          Notifications
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything sent to you, newest first. The bell shows only what still needs
          action.
        </p>
      </header>

      <NotificationHistory
        rows={notifications.map((row) => ({
          ...row,
          readAt: row.readAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        }))}
        nowIso={new Date().toISOString()}
      />
    </div>
  );
}
