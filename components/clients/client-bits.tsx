"use client";

import { CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  HEALTH_LABELS,
  HEALTH_TONES,
  healthFromStatus,
  milestoneDayLabel,
  type ClientMilestone,
  type ClientRow,
} from "@/lib/clients/client-workspace";

/**
 * The small pieces the dashboard and the client workspace both use.
 *
 * Shared rather than written twice, so a health chip on a directory row and the
 * same account's header can never disagree about what colour it is.
 */

export function money(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

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

export function initialsOf(name: string | null): string {
  if (!name) return "??";

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A person or an account, as initials.
 *
 * There is no logo or avatar column on either record yet, so this is initials
 * in a stable colour rather than a placeholder image - two letters carry more
 * than a repeated grey silhouette does.
 */
export function Monogram({
  name,
  size = "sm",
  square = false,
}: {
  name: string | null;
  size?: "sm" | "md" | "lg";
  square?: boolean;
}) {
  const dimensions =
    size === "lg" ? "h-14 w-14 text-base" : size === "md" ? "h-9 w-9 text-xs" : "h-7 w-7 text-[10px]";

  return (
    <span
      title={name ?? "Unassigned"}
      className={`inline-flex shrink-0 items-center justify-center font-semibold ${toneFor(name)} ${dimensions} ${
        square ? "rounded-xl" : "rounded-full"
      }`}
    >
      {initialsOf(name)}
    </span>
  );
}

export function OwnerChip({ name }: { name: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Monogram name={name} />
      <span className="truncate text-slate-700">{name ?? "Unassigned"}</span>
    </span>
  );
}

/**
 * Client health, and nothing else.
 *
 * Deliberately never carries an operational state: "Waiting on Client" is a
 * separate chip, because an account can be perfectly healthy and still be
 * waiting on a login.
 */
export function HealthBadge({ client }: { client: ClientRow }) {
  const health = healthFromStatus(client.healthStatus, {
    hasBlocker: Boolean(client.currentBlocker?.trim()),
  });

  return (
    <Badge tone={HEALTH_TONES[health]} className="whitespace-nowrap">
      {HEALTH_LABELS[health]}
    </Badge>
  );
}

/** The operational state, shown beside health rather than inside it. */
export function WaitingBadge() {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
      Waiting on Client
    </span>
  );
}

export function StageBadge({ name }: { name: string }) {
  return (
    <Badge tone="violet" className="whitespace-nowrap">
      {name}
    </Badge>
  );
}

/** "Client Review · Aug 18", with the time when the record carries one. */
export function MilestoneText({
  milestone,
  now,
}: {
  milestone: ClientMilestone | null;
  now: Date;
}) {
  if (!milestone) {
    return <span className="text-slate-400">No milestone set</span>;
  }

  const at = new Date(milestone.dueAt);
  const overdue = at < now;

  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium text-slate-800" title={milestone.name}>
        {milestone.name}
      </span>
      <span
        className={`flex items-center gap-1 text-[11px] ${
          overdue ? "text-rose-600" : "text-slate-500"
        }`}
      >
        <CalendarDays className="h-3 w-3 shrink-0" />
        {milestoneDayLabel(milestone.dueAt, now)}
        {milestone.hasTime
          ? `, ${at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
          : ""}
      </span>
    </span>
  );
}

export function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
      {children}
    </p>
  );
}
