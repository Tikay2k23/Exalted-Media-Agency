"use client";

import {
  CalendarDays,
  FileText,
  MessageSquare,
  Paperclip,
  Phone,
  SquareCheckBig,
  StickyNote,
  type LucideIcon,
} from "lucide-react";

import { initialsOf } from "@/lib/sales/pipeline-board";
import { followUpLabel, type SalesLead } from "@/lib/sales/sales-view";

/**
 * The small pieces the board card and the list row both use.
 *
 * Shared rather than written twice, because the two views show the same
 * opportunities and a follow-up that reads "Overdue by 2 days" on the board and
 * "Aug 11" in the list is the same bug as two different numbers.
 */

export function money(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/** A deterministic colour per person, so the same face is the same colour. */
const AVATAR_TONES = [
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
];

function toneFor(name: string | null) {
  if (!name) return "bg-slate-100 text-slate-500";

  let hash = 0;

  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 997;
  }

  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

/**
 * The owner, as initials.
 *
 * There is no avatar column on a user yet, so this is initials rather than a
 * placeholder photograph - a grey silhouette repeated down a column tells you
 * less than two letters does.
 */
export function OwnerAvatar({
  name,
  size = "sm",
}: {
  name: string | null;
  size?: "sm" | "md";
}) {
  return (
    <span
      title={name ?? "Unassigned"}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${toneFor(name)} ${
        size === "md" ? "h-8 w-8 text-[11px]" : "h-6 w-6 text-[10px]"
      }`}
    >
      {initialsOf(name)}
    </span>
  );
}

export function OwnerChip({ name }: { name: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <OwnerAvatar name={name} />
      <span className="truncate text-slate-700">{name ?? "Unassigned"}</span>
    </span>
  );
}

const FOLLOW_UP_TONE = {
  overdue: "text-rose-600 font-medium",
  today: "text-amber-600 font-medium",
  soon: "text-amber-600",
  later: "text-slate-600",
  none: "text-slate-400",
} as const;

/** Overdue in red, due today in amber, everything else quiet. */
export function FollowUpText({
  value,
  now,
  className = "",
}: {
  value: string | null;
  now: Date;
  className?: string;
}) {
  const due = followUpLabel(value, now);

  return (
    <span className={`whitespace-nowrap ${FOLLOW_UP_TONE[due.tone]} ${className}`}>
      {due.label}
    </span>
  );
}

/** "Not set", in a warning tone, rather than an empty cell nobody notices. */
export function NextActionText({ value }: { value: string | null }) {
  if (!value?.trim()) {
    return <span className="text-amber-600">Not set</span>;
  }

  return (
    <span className="line-clamp-2" title={value}>
      {value}
    </span>
  );
}

export function StageTag({ tag }: { tag: string | null }) {
  if (!tag) return null;

  return (
    <span className="rounded bg-slate-900/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-500">
      {tag}
    </span>
  );
}

export function CustomTag({ tag }: { tag: string }) {
  return (
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
      {tag}
    </span>
  );
}

interface Indicator {
  key: keyof SalesLead["activity"];
  icon: LucideIcon;
  label: string;
  tone: string;
}

const INDICATORS: Indicator[] = [
  { key: "calls", icon: Phone, label: "call", tone: "text-emerald-600" },
  { key: "notes", icon: StickyNote, label: "note", tone: "text-amber-600" },
  { key: "tasks", icon: SquareCheckBig, label: "task", tone: "text-indigo-600" },
  { key: "appointments", icon: CalendarDays, label: "appointment", tone: "text-violet-600" },
  { key: "files", icon: Paperclip, label: "file", tone: "text-slate-500" },
];

/**
 * What has actually happened on this deal.
 *
 * Every icon carries a real count and the ones at zero are dimmed rather than
 * hidden, so the row of icons stays the same shape on every card and the eye
 * can compare down a column. An icon that is always lit would be decoration.
 */
export function ActivityIndicators({
  activity,
  onOpenSection,
}: {
  activity: SalesLead["activity"];
  onOpenSection?: (key: keyof SalesLead["activity"]) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {INDICATORS.map(({ key, icon: Icon, label, tone }) => {
        const count = activity[key];
        const title =
          count === 0
            ? `No ${label}s yet`
            : `${count} ${label}${count === 1 ? "" : "s"}`;

        const content = (
          <>
            <Icon className="h-3.5 w-3.5" />
            {count > 0 ? <span className="text-[10px] font-semibold">{count}</span> : null}
          </>
        );

        const className = `inline-flex items-center gap-0.5 ${
          count > 0 ? tone : "text-slate-300"
        }`;

        return onOpenSection ? (
          <button
            key={key}
            type="button"
            title={title}
            aria-label={title}
            onClick={(event) => {
              // The card behind this opens the drawer too; without this the
              // click would fire both and the section choice would be lost.
              event.stopPropagation();
              onOpenSection(key);
            }}
            className={`${className} rounded transition hover:opacity-70`}
          >
            {content}
          </button>
        ) : (
          <span key={key} title={title} className={className}>
            {content}
          </span>
        );
      })}
    </div>
  );
}

export function SourceText({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-slate-500">
      <FileText className="h-3 w-3" />
      {source
        .toLowerCase()
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")}
    </span>
  );
}

export function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 py-6 text-center text-xs text-slate-400">
      <MessageSquare className="h-3.5 w-3.5" />
      {children}
    </p>
  );
}
