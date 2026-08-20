"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  CATEGORY_LABELS,
  type NotificationCategory,
  type NotificationRow,
  type TabKey,
  TABS,
  actionLabelFor,
  categoryOf,
  matchesTab,
  relativeTimeLabel,
  sortNotifications,
  tabCounts,
} from "@/lib/notifications-view";
import { cn } from "@/lib/utils";

/**
 * The full list, ungrouped.
 *
 * Deliberately not folded the way the popup folds: somebody who has opened the
 * history is looking for a particular notification, and collapsing two hundred
 * approval requests into one line is exactly the wrong thing there. The
 * categories and ordering are the shared ones.
 */

const CHIP: Record<NotificationCategory, string> = {
  CRITICAL: "bg-rose-50 text-rose-700",
  ACTION: "bg-amber-50 text-amber-700",
  UPDATE: "bg-sky-50 text-sky-700",
};

export function NotificationHistory({
  rows,
  nowIso,
}: {
  rows: NotificationRow[];
  nowIso: string;
}) {
  const [now] = useState(() => new Date(nowIso));
  const [tab, setTab] = useState<TabKey>("all");

  const counts = useMemo(() => tabCounts(rows), [rows]);
  const shown = useMemo(
    () => sortNotifications(rows.filter((row) => matchesTab(row, tab))),
    [rows, tab],
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 p-2">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            aria-pressed={tab === entry.key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
              tab === entry.key
                ? "bg-slate-100 text-slate-900"
                : "text-slate-500 hover:bg-slate-50",
            )}
          >
            {entry.label}
            {counts[entry.key] > 0 ? (
              <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-600">
                {counts[entry.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-slate-500">
          Nothing here yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {shown.map((row) => {
            const category = categoryOf(row.type, row.urgency);
            const unread = !row.readAt;

            return (
              <li
                key={row.id}
                className={cn("px-4 py-3", unread ? "bg-white" : "bg-slate-50/40")}
              >
                <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                  <p
                    className={cn(
                      "min-w-0 flex-1 text-sm",
                      unread ? "font-semibold text-slate-950" : "text-slate-600",
                    )}
                  >
                    {row.title}
                  </p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      CHIP[category],
                    )}
                  >
                    {CATEGORY_LABELS[category]}
                  </span>
                </div>

                {row.body ? (
                  <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                    {row.body}
                  </p>
                ) : null}

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    {relativeTimeLabel(row.createdAt, now)}
                  </span>
                  {row.href ? (
                    <Link
                      href={row.href}
                      className="text-[11px] font-semibold text-sky-700 hover:text-sky-800"
                    >
                      {actionLabelFor(row.type) ?? "Open"}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
