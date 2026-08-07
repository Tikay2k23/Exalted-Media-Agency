"use client";

import { Bell, CheckCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";

interface NotificationRow {
  id: string;
  type: string;
  urgency: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

const urgencyTone = {
  CRITICAL: "rose",
  HIGH: "amber",
  NORMAL: "sky",
  LOW: "slate",
} as const;

export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape, so the panel never traps the page.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function openPanel() {
    setIsOpen((open) => !open);

    if (isOpen) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/notifications?limit=15");

      if (!response.ok) {
        setError("We couldn't load your notifications.");
        return;
      }

      const data = (await response.json()) as {
        notifications: NotificationRow[];
        unreadCount: number;
      };

      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      setError("We couldn't load your notifications.");
    } finally {
      setIsLoading(false);
    }
  }

  function markAllRead() {
    startTransition(async () => {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAllRead" }),
      });

      if (!response.ok) {
        setError("We couldn't update your notifications.");
        return;
      }

      setNotifications((rows) =>
        rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })),
      );
      setUnreadCount(0);
      router.refresh();
    });
  }

  function markOneRead(notificationId: string) {
    startTransition(async () => {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markRead", notificationId }),
      });

      setNotifications((rows) =>
        rows.map((row) =>
          row.id === notificationId
            ? { ...row, readAt: row.readAt ?? new Date().toISOString() }
            : row,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      router.refresh();
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={openPanel}
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
        }
        aria-expanded={isOpen}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[0.65rem] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.45)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 transition hover:text-sky-800 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Loading notifications...
              </div>
            ) : error ? (
              <p className="px-4 py-6 text-sm text-rose-600">{error}</p>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-700">You are all caught up</p>
                <p className="mt-1 text-sm text-slate-500">
                  Assignments, approvals, and alerts will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((notification) => {
                  const unread = !notification.readAt;
                  const body = (
                    <div
                      className={cn(
                        "px-4 py-3 transition",
                        unread ? "bg-sky-50/60" : "bg-white",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {notification.title}
                        </p>
                        <Badge tone={urgencyTone[notification.urgency]}>
                          {notification.urgency === "CRITICAL" ? "Critical" : null}
                          {notification.urgency === "HIGH" ? "High" : null}
                          {notification.urgency === "NORMAL" ? "Info" : null}
                          {notification.urgency === "LOW" ? "Low" : null}
                        </Badge>
                      </div>
                      {notification.body ? (
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {notification.body}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                        {formatDateTime(notification.createdAt)}
                      </p>
                    </div>
                  );

                  return (
                    <li key={notification.id}>
                      {notification.href ? (
                        <Link
                          href={notification.href}
                          onClick={() => {
                            if (unread) {
                              markOneRead(notification.id);
                            }
                            setIsOpen(false);
                          }}
                          className="block hover:bg-slate-50"
                        >
                          {body}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => unread && markOneRead(notification.id)}
                          className="block w-full text-left hover:bg-slate-50"
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
