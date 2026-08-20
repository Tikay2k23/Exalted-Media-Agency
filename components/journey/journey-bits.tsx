"use client";

import {
  HEALTH_COLORS,
  HEALTH_LABELS,
  type JourneyHealth,
} from "@/lib/journey/journey-board";
import { cn } from "@/lib/utils";

/**
 * The small pieces the Journey board repeats.
 *
 * Kept together so a card, a table row and the drawer cannot end up showing
 * the same account's health three slightly different ways.
 */

export function HealthDot({
  health,
  className,
}: {
  health: JourneyHealth;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: HEALTH_COLORS[health] }}
      aria-hidden
    />
  );
}

const HEALTH_CHIP: Record<JourneyHealth, string> = {
  ON_TRACK: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  WAITING: "bg-amber-50 text-amber-700 ring-amber-100",
  AT_RISK: "bg-rose-50 text-rose-700 ring-rose-100",
  BLOCKED: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function HealthChip({
  health,
  className,
}: {
  health: JourneyHealth;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        HEALTH_CHIP[health],
        className,
      )}
    >
      <HealthDot health={health} />
      {HEALTH_LABELS[health]}
    </span>
  );
}

/**
 * A thin progress rail.
 *
 * Deliberately not the shared ui/progress bar: that one is 8px with a
 * three-colour gradient, which is right for a headline figure and far too loud
 * repeated twenty times down a column of cards.
 */
export function ProgressRail({
  value,
  health,
  className,
}: {
  value: number;
  health: JourneyHealth;
  className?: string;
}) {
  return (
    <div
      className={cn("h-1 w-full overflow-hidden rounded-full bg-slate-100", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          backgroundColor: HEALTH_COLORS[health],
        }}
      />
    </div>
  );
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

/** The person holding the account, as a compact circle. */
export function OwnerBubble({
  name,
  className,
}: {
  name: string | null;
  className?: string;
}) {
  if (!name) {
    return (
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-slate-300 text-[10px] font-semibold text-slate-400",
          className,
        )}
        title="Nobody owns this account"
      >
        ?
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white",
        className,
      )}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A soft-tinted icon square, as used by the summary cards. */
export function IconTile({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
        className,
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

export function PanelCard({
  title,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 px-4 pt-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </header>
      <div className={cn("px-4 pb-4 pt-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs leading-5 text-slate-500">
      {children}
    </p>
  );
}
