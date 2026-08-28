"use client";

import {
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCheck,
  CircleCheck,
  CreditCard,
  FileText,
  Hourglass,
  KeyRound,
  LoaderCircle,
  MessageSquareWarning,
  MoreVertical,
  Rocket,
  ShieldAlert,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import {
  type NotificationCategory,
  type NotificationGroup,
  type NotificationRow,
  type TabKey,
  TABS,
  groupNotifications,
  matchesTab,
  relativeTimeLabel,
  tabCounts,
} from "@/lib/notifications-view";
import { cn } from "@/lib/utils";

/**
 * The notification popup.
 *
 * A small floating panel, not a page: the whole point is to see what needs
 * doing and act on it without leaving whatever you were in the middle of. It
 * shows at most a screenful, folds repeats of the same thing into one line,
 * and puts a single button on anything actionable.
 *
 * Categories, ordering, grouping and the action labels are all decided in
 * lib/notifications-view.ts, which knows nothing about React - so the rules
 * can be tested, and the badge count in the header uses the same list the
 * server counts by.
 */

const ICONS = {
  alert: TriangleAlert,
  task: CircleCheck,
  report: Hourglass,
  key: KeyRound,
  payment: CreditCard,
  person: UserRound,
  revision: MessageSquareWarning,
  approval: FileText,
  renewal: CalendarClock,
  launch: Rocket,
  health: ShieldAlert,
  override: ShieldAlert,
  bell: Bell,
} as const;

const CATEGORY_STYLES: Record<
  NotificationCategory,
  { rail: string; chip: string; icon: string }
> = {
  CRITICAL: {
    rail: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700",
    icon: "bg-rose-50 text-rose-600",
  },
  ACTION: {
    rail: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700",
    icon: "bg-amber-50 text-amber-600",
  },
  UPDATE: {
    rail: "bg-transparent",
    chip: "bg-sky-50 text-sky-700",
    icon: "bg-sky-50 text-sky-600",
  },
};

const CATEGORY_CHIP_LABEL: Record<NotificationCategory, string> = {
  CRITICAL: "Critical",
  ACTION: "Action Required",
  UPDATE: "Update",
};

export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [totalUnread, setTotalUnread] = useState(0);
  const [tab, setTab] = useState<TabKey>("all");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [now] = useState(() => new Date());

  /** Where the panel sits. Null until it has been measured. */
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  /*
   * Positioned from the bell's measured rectangle, then clamped to the screen.
   *
   * It cannot simply hang off the bell with `right-0`: the bell is not the
   * rightmost control - settings and sign out follow it - so on a phone a
   * 351px panel anchored to its right edge started at -149px, with the tabs
   * and half the text off the left of the screen.
   *
   * Nor can it be `fixed` in place: the top bar uses backdrop-blur, which
   * makes it the containing block for fixed children, so the panel would be
   * positioned against the header rather than the viewport. Hence the portal
   * below, and one clamp that serves every screen size instead of a
   * breakpoint.
   */
  const position = useCallback(() => {
    const button = buttonRef.current;

    if (!button) return;

    const rect = button.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(432, window.innerWidth - margin * 2);
    const preferred = rect.right - width;
    const left = Math.max(
      margin,
      Math.min(preferred, window.innerWidth - width - margin),
    );

    setAnchor({ top: rect.bottom + 8, left, width });
  }, []);

  // Close on an outside click or Escape, so the panel never traps the page.
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      // The panel lives in a portal, so it is not inside containerRef; both
      // have to be checked or every click inside it would close it.
      const inside =
        containerRef.current?.contains(target) || popupRef.current?.contains(target);

      if (!inside) {
        setIsOpen(false);
        setMenuFor(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        setMenuFor(null);
      }
    }

    /*
     * Repositioning read layout on every scroll event, on the capture phase,
     * and blocked the scroll while it did it. One measurement per frame is
     * all the panel can actually use, and passive tells the browser it may
     * scroll without waiting to find out whether this cancels it.
     */
    let frame = 0;

    const onScrollOrResize = () => {
      if (frame) return;

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        position();
      });
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    // Reposition rather than drift: rotating a phone or scrolling the page
    // moves the bell, and the panel has to follow it.
    window.addEventListener("resize", onScrollOrResize, { passive: true });
    window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, { capture: true });
    };
  }, [isOpen, position]);

  async function load() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/notifications?limit=50");

      if (!response.ok) {
        setError("We couldn't load your notifications.");
        return;
      }

      const data = (await response.json()) as {
        notifications: NotificationRow[];
        unreadCount: number;
        totalUnread: number;
      };

      setRows(data.notifications);
      setUnreadCount(data.unreadCount);
      setTotalUnread(data.totalUnread);
    } catch {
      setError("We couldn't load your notifications.");
    } finally {
      setIsLoading(false);
    }
  }

  function togglePanel() {
    const next = !isOpen;

    setIsOpen(next);
    setMenuFor(null);

    if (next) {
      position();
      void load();
    }
  }

  /** Every mutation posts the whole group, so a folded row acts as one thing. */
  function mutate(action: "markRead" | "markUnread" | "dismiss", ids: string[]) {
    startTransition(async () => {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notificationId: ids[0],
          notificationIds: ids,
        }),
      });

      if (!response.ok) {
        setError("We couldn't update that notification.");
        return;
      }

      setRows((current) => {
        if (action === "dismiss") {
          return current.filter((row) => !ids.includes(row.id));
        }

        const stamp = action === "markRead" ? new Date().toISOString() : null;

        return current.map((row) =>
          ids.includes(row.id) ? { ...row, readAt: stamp } : row,
        );
      });

      setMenuFor(null);
      await load();
      router.refresh();
    });
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

      setRows((current) =>
        current.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })),
      );
      setUnreadCount(0);
      setTotalUnread(0);
      router.refresh();
    });
  }

  const counts = useMemo(() => tabCounts(rows), [rows]);
  const groups = useMemo(
    () => groupNotifications(rows.filter((row) => matchesTab(row, tab))),
    [rows, tab],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={togglePanel}
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} need action` : "Notifications"
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

      {isOpen && anchor
        ? createPortal(
            <div
              ref={popupRef}
              role="dialog"
              aria-label="Notifications"
              style={{ top: anchor.top, left: anchor.left, width: anchor.width }}
              className="fixed z-50 flex max-h-[min(38rem,calc(100vh-6rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_-36px_rgba(15,23,42,0.45)]"
            >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5">
            <h2 className="text-base font-semibold text-slate-950">Notifications</h2>
            {totalUnread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 transition hover:text-sky-800 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Notification filters"
            className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-100 px-2 pb-2"
          >
            {TABS.map((entry) => {
              const count = counts[entry.key];
              const active = tab === entry.key;

              return (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(entry.key)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
                  )}
                >
                  {entry.label}
                  {count > 0 ? (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px] font-semibold",
                        entry.key === "critical"
                          ? "bg-rose-100 text-rose-700"
                          : entry.key === "action"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-200 text-slate-600",
                      )}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* List - the only thing that scrolls */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {isLoading ? (
              <p className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                Loading notifications...
              </p>
            ) : error ? (
              <p className="px-4 py-6 text-sm text-rose-600">{error}</p>
            ) : groups.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-800">
                  You&apos;re all caught up.
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  No notifications need your attention right now.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {groups.map((group) => (
                  <NotificationItem
                    key={group.id}
                    group={group}
                    now={now}
                    menuOpen={menuFor === group.id}
                    onMenu={(open) => setMenuFor(open ? group.id : null)}
                    onMutate={mutate}
                    onNavigate={() => setIsOpen(false)}
                    busy={isPending}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-100 bg-white">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-sky-700 transition hover:bg-slate-50"
            >
              View all notifications
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function NotificationItem({
  group,
  now,
  menuOpen,
  onMenu,
  onMutate,
  onNavigate,
  busy,
}: {
  group: NotificationGroup;
  now: Date;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onMutate: (action: "markRead" | "markUnread" | "dismiss", ids: string[]) => void;
  onNavigate: () => void;
  busy: boolean;
}) {
  const styles = CATEGORY_STYLES[group.category];
  const Icon = ICONS[group.iconKey as keyof typeof ICONS] ?? Bell;
  const ids = group.members.map((member) => member.id);

  return (
    <li className={cn("relative", group.unread ? "bg-white" : "bg-slate-50/40")}>
      {/* The coloured rail is how importance reads before any text is. */}
      <span
        className={cn("absolute inset-y-0 left-0 w-[3px]", styles.rail)}
        aria-hidden
      />

      <div className="flex gap-3 py-3 pl-4 pr-2.5">
        <span
          className={cn(
            "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            styles.icon,
          )}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p
              className={cn(
                "min-w-0 flex-1 text-sm leading-tight",
                group.unread ? "font-semibold text-slate-950" : "font-medium text-slate-600",
              )}
            >
              {group.title}
            </p>

            {group.category !== "UPDATE" ? (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  styles.chip,
                )}
              >
                {CATEGORY_CHIP_LABEL[group.category]}
              </span>
            ) : null}

            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Notification options"
                onClick={() => onMenu(!menuOpen)}
                className="-mr-1 rounded-md p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>

              {menuOpen ? (
                <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onMutate(group.unread ? "markRead" : "markUnread", ids)
                    }
                    className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Mark as {group.unread ? "read" : "unread"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onMutate("dismiss", ids)}
                    className="block w-full px-3 py-1.5 text-left text-xs text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {group.subject ? (
            <p className="mt-0.5 truncate text-xs font-medium text-slate-700">
              {group.subject}
            </p>
          ) : null}

          {group.body ? (
            <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-slate-500">
              {group.body}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">
              {relativeTimeLabel(group.createdAt, now)}
              {group.count > 1 ? ` · ${group.count} notifications` : ""}
            </span>

            {group.href ? (
              <Link
                href={group.href}
                onClick={() => {
                  if (group.unread) onMutate("markRead", ids);
                  onNavigate();
                }}
                className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {group.actionLabel ?? "Open"}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
