"use client";

import { HealthChip, OwnerBubble, ProgressRail } from "@/components/journey/journey-bits";
import {
  type JourneyAccount,
  deriveHealth,
  deriveProgress,
  milestoneDayLabel,
  nextMilestone,
  stageAging,
} from "@/lib/journey/journey-board";
import { journeyStageOf } from "@/lib/journey/journey-board";
import { phaseByKey } from "@/lib/journey/phases";
import { cn } from "@/lib/utils";

/*
 * Explicit widths, because `table-fixed` without a colgroup gives every column
 * an equal share - which puts "Waiting for Client Information" and "Aug 21" on
 * the same width and truncates the one that carries the meaning.
 */
const COLUMNS = [
  { key: "client", label: "Client", width: "w-[18%]" },
  { key: "stage", label: "Current Stage", width: "w-[15%]" },
  { key: "phase", label: "Phase", width: "w-[9%]" },
  { key: "pm", label: "Project Manager", width: "w-[12%]" },
  { key: "health", label: "Health", width: "w-[10%]" },
  { key: "progress", label: "Progress", width: "w-[10%]" },
  { key: "days", label: "Days in Stage", width: "w-[10%]" },
  { key: "milestone", label: "Next Milestone", width: "w-[16%]" },
] as const;

function dateCell(value: string | null) {
  return value ? milestoneDayLabel(value) : "-";
}

export function JourneyTable({
  accounts,
  now,
  onOpen,
}: {
  accounts: JourneyAccount[];
  now: Date;
  onOpen: (account: JourneyAccount) => void;
}) {
  if (accounts.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-sm text-slate-500">
        No clients match these filters.
      </p>
    );
  }

  return (
    <>
      {/* Wide: a table that scrolls inside its own box, never the page. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full table-fixed text-left text-[13px]">
          <colgroup>
            {COLUMNS.map((column) => (
              <col key={column.key} className={column.width} />
            ))}
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-3 py-2.5 font-semibold">
                  {column.label}
                </th>
              ))}
              <th className="px-3 py-2.5 font-semibold">Launch Date</th>
              <th className="px-3 py-2.5 font-semibold">Renewal Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {accounts.map((account) => {
              const health = deriveHealth(account, now);
              const progress = deriveProgress(account);
              const aging = stageAging(account, now);
              const milestone = nextMilestone(account, now);
              const phase = phaseByKey(journeyStageOf(account).phase);

              return (
                <tr
                  key={account.id}
                  onClick={() => onOpen(account)}
                  className="cursor-pointer align-middle transition hover:bg-slate-50"
                >
                  <td className="px-3 py-2.5">
                    <p className="truncate font-semibold text-slate-900">
                      {account.companyName}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {account.clientName}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="truncate font-medium"
                      style={{ color: account.stageColor }}
                    >
                      {account.stageName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{phase.label}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <OwnerBubble
                        name={account.projectManagerName}
                        className="h-6 w-6 text-[9px]"
                      />
                      <span className="truncate text-slate-600">
                        {account.projectManagerName ?? "Unassigned"}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <HealthChip health={health} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-700">
                      {progress}%
                    </span>
                    <ProgressRail value={progress} health={health} />
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5",
                      aging.isOverTarget ? "font-semibold text-rose-600" : "text-slate-600",
                    )}
                  >
                    {aging.days}
                    {aging.targetDays !== null ? (
                      <span className="text-slate-400"> / {aging.targetDays}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    {milestone ? (
                      <>
                        <p className="truncate text-slate-700">{milestone.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {milestoneDayLabel(milestone.dueAt)}
                        </p>
                      </>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {dateCell(account.launchDate)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {dateCell(account.renewalDate ?? account.contractEndDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Narrow: the same rows as cards, so nothing scrolls sideways. */}
      <ul className="divide-y divide-slate-100 lg:hidden">
        {accounts.map((account) => {
          const health = deriveHealth(account, now);
          const progress = deriveProgress(account);
          const aging = stageAging(account, now);
          const milestone = nextMilestone(account, now);

          return (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => onOpen(account)}
                className="w-full px-4 py-3 text-left transition hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {account.companyName}
                    </p>
                    <p
                      className="mt-0.5 truncate text-xs font-medium"
                      style={{ color: account.stageColor }}
                    >
                      {account.stageName}
                    </p>
                  </div>
                  <HealthChip health={health} />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                  <span>PM: {account.projectManagerName ?? "Unassigned"}</span>
                  <span className="font-semibold text-slate-700">{progress}%</span>
                  <span className={cn(aging.isOverTarget && "font-medium text-rose-600")}>
                    {aging.label}
                  </span>
                </div>

                <ProgressRail value={progress} health={health} className="mt-2" />

                {milestone ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    Next: {milestone.name} &middot; {milestoneDayLabel(milestone.dueAt)}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
