"use client";

import {
  ArrowRightLeft,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  Flag,
  ShieldAlert,
  Upload,
} from "lucide-react";

import { EmptyNote, PanelCard } from "@/components/journey/journey-bits";
import {
  HEALTH_COLORS,
  type JourneyActivityEntry,
  type JourneyHealth,
  type JourneyMilestone,
  milestoneDayLabel,
  relativeTime,
} from "@/lib/journey/journey-board";

/* -------------------------------------------------------------------------- */
/* Journey Health                                                             */
/* -------------------------------------------------------------------------- */

interface HealthSlice {
  health: JourneyHealth;
  label: string;
  color: string;
  value: number;
  share: number;
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A donut drawn from the same counts the legend prints.
 *
 * One pass over the slices accumulates the rotation, so the ring and the
 * numbers beside it cannot disagree - which they would the moment somebody
 * computed the arc from anything other than the count itself.
 */
export function JourneyHealthPanel({
  slices,
  total,
}: {
  slices: HealthSlice[];
  total: number;
}) {
  /*
   * The arc offsets are worked out before the render rather than accumulated
   * inside it. Mutating a variable while mapping happens to draw correctly on
   * the first pass and is not safe to repeat, and React is right to object.
   */
  const arcs: { slice: HealthSlice; length: number; offset: number }[] = [];
  let running = 0;

  for (const slice of slices) {
    if (slice.value === 0) continue;

    const length = (slice.value / total) * CIRCUMFERENCE;

    arcs.push({ slice, length, offset: running });
    running += length;
  }

  return (
    <PanelCard title="Journey Health">
      {total === 0 ? (
        <EmptyNote>No active clients to assess yet.</EmptyNote>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative h-[104px] w-[104px] shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="12"
              />
              {arcs.map((arc) => (
                <circle
                  key={arc.slice.health}
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  fill="none"
                  stroke={arc.slice.color}
                  strokeWidth="12"
                  strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
                  strokeDashoffset={-arc.offset}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold leading-none text-slate-900">
                {total}
              </span>
              <span className="mt-0.5 text-[10px] text-slate-500">Total</span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-1.5">
            {slices.map((slice) => (
              <li
                key={slice.health}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                    aria-hidden
                  />
                  <span className="truncate">{slice.label}</span>
                </span>
                <span className="shrink-0 font-medium text-slate-900">
                  {slice.value}{" "}
                  <span className="font-normal text-slate-400">({slice.share}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PanelCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Upcoming Milestones                                                        */
/* -------------------------------------------------------------------------- */

const MILESTONE_TONE: Record<JourneyMilestone["source"], string> = {
  milestone: "bg-sky-500",
  launch: "bg-emerald-500",
  renewal: "bg-violet-500",
  "next-action": "bg-amber-500",
  "stage-target": "bg-slate-300",
};

const MILESTONE_CAPTION: Record<JourneyMilestone["source"], string> = {
  milestone: "Project milestone",
  launch: "Launch",
  renewal: "Renewal",
  "next-action": "Next action",
  "stage-target": "Stage target",
};

export function UpcomingMilestonesPanel({
  milestones,
  onOpenClient,
}: {
  milestones: JourneyMilestone[];
  onOpenClient: (clientId: string) => void;
}) {
  return (
    <PanelCard title="Upcoming Milestones">
      {milestones.length === 0 ? (
        <EmptyNote>
          Nothing is scheduled. Milestones appear here from project plans, launch
          dates, renewals and stage targets.
        </EmptyNote>
      ) : (
        <ul className="space-y-2.5">
          {milestones.map((milestone) => (
            <li key={milestone.id}>
              <button
                type="button"
                onClick={() => onOpenClient(milestone.clientId)}
                className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-slate-50"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    MILESTONE_TONE[milestone.source]
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-900">
                    {milestone.companyName}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {milestone.name}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    {MILESTONE_CAPTION[milestone.source]}
                  </span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-[11px] font-medium text-slate-500">
                  {milestoneDayLabel(milestone.dueAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Recent Activity                                                            */
/* -------------------------------------------------------------------------- */

const ACTIVITY_ICON = {
  stage: ArrowRightLeft,
  override: ShieldAlert,
  blocker: CircleAlert,
  approval: FileCheck2,
  asset: Upload,
  milestone: Flag,
  other: CheckCircle2,
} as const;

const ACTIVITY_TONE = {
  stage: "bg-sky-50 text-sky-600",
  override: "bg-rose-50 text-rose-600",
  blocker: "bg-amber-50 text-amber-600",
  approval: "bg-emerald-50 text-emerald-600",
  asset: "bg-violet-50 text-violet-600",
  milestone: "bg-slate-100 text-slate-600",
  other: "bg-slate-100 text-slate-600",
} as const;

export function RecentActivityPanel({
  entries,
  now,
  onOpenClient,
}: {
  entries: JourneyActivityEntry[];
  now: Date;
  onOpenClient: (clientId: string) => void;
}) {
  return (
    <PanelCard title="Recent Activity">
      {entries.length === 0 ? (
        <EmptyNote>
          No journey activity recorded yet. Stage moves, overrides and account
          changes appear here.
        </EmptyNote>
      ) : (
        <ul className="space-y-2.5">
          {entries.map((entry) => {
            const Icon = ACTIVITY_ICON[entry.kind];

            return (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => entry.clientId && onOpenClient(entry.clientId)}
                  className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-slate-50"
                >
                  <span
                    className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                      ACTIVITY_TONE[entry.kind]
                    }`}
                    aria-hidden
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] leading-4 text-slate-700">
                      {entry.action}
                    </span>
                    {entry.actorName ? (
                      <span className="block text-[10px] text-slate-400">
                        {entry.actorName}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-[10px] text-slate-400">
                    {relativeTime(entry.createdAt, now)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PanelCard>
  );
}

export { HEALTH_COLORS };
