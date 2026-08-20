"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { useState } from "react";

import { HealthDot, OwnerBubble, ProgressRail } from "@/components/journey/journey-bits";
import {
  type JourneyAccount,
  type PhaseColumn,
  deriveHealth,
  deriveProgress,
  stageAging,
} from "@/lib/journey/journey-board";
import { cn } from "@/lib/utils";

/** How many cards a column shows before it offers to expand. */
const COLLAPSED_LIMIT = 5;

function AccountCard({
  account,
  now,
  onOpen,
}: {
  account: JourneyAccount;
  now: Date;
  onOpen: (account: JourneyAccount) => void;
}) {
  const health = deriveHealth(account, now);
  const progress = deriveProgress(account);
  const aging = stageAging(account, now);

  return (
    <button
      type="button"
      onClick={() => onOpen(account)}
      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(15,23,42,0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">
            {account.companyName}
          </p>
          <p
            className="mt-1 truncate text-[11px] font-medium"
            style={{ color: account.stageColor }}
          >
            {account.stageName}
          </p>
        </div>
        <OwnerBubble name={account.projectManagerName} />
      </div>

      <p className="mt-2 truncate text-[11px] text-slate-500">
        PM: {account.projectManagerName ?? "Unassigned"}
      </p>

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
        <HealthDot health={health} />
        <span className="font-semibold text-slate-700">{progress}%</span>
        <span aria-hidden>&middot;</span>
        <span className={cn("truncate", aging.isOverTarget && "font-medium text-rose-600")}>
          {aging.label}
        </span>
      </div>

      <ProgressRail value={progress} health={health} className="mt-2" />

      {account.currentBlocker ? (
        <p className="mt-2 flex items-start gap-1 text-[11px] leading-4 text-rose-700">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span className="line-clamp-2">{account.currentBlocker}</span>
        </p>
      ) : null}
    </button>
  );
}

function Column({
  column,
  now,
  onOpen,
}: {
  column: PhaseColumn;
  now: Date;
  onOpen: (account: JourneyAccount) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? column.accounts : column.accounts.slice(0, COLLAPSED_LIMIT);
  const hidden = column.accounts.length - shown.length;

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/50">
      {/*
       * The heading sticks while the column scrolls. Four columns of cards
       * with the phase name scrolled off the top is a board nobody can read
       * past the first screen.
       */}
      <header
        className={cn(
          "sticky top-0 z-10 rounded-t-xl border-b px-3 py-2.5 backdrop-blur-sm",
          column.headerClass,
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", column.accentClass)} aria-hidden />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
            {column.label}
          </h3>
        </div>
        <p className="mt-0.5 truncate text-[10px] text-slate-500">{column.blurb}</p>
        <p className="mt-1 text-[11px] font-medium text-slate-600">
          {column.accounts.length} client{column.accounts.length === 1 ? "" : "s"}
        </p>
      </header>

      <div className="flex flex-col gap-2 p-2">
        {shown.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11px] text-slate-400">
            No clients in this phase
          </p>
        ) : (
          shown.map((account) => (
            <AccountCard key={account.id} account={account} now={now} onOpen={onOpen} />
          ))
        )}

        {hidden > 0 || expanded ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-white hover:text-slate-800"
          >
            {expanded ? (
              "Show less"
            ) : (
              <>
                <Plus className="h-3 w-3" aria-hidden />
                View all ({column.accounts.length})
              </>
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The four-phase board.
 *
 * Four columns rather than the eighteen stages the database stores. Eighteen
 * columns needs sideways scrolling on any screen, and with a handful of
 * accounts in each it says less than four columns does - the card still names
 * the exact stage, so nothing is lost by grouping.
 */
export function JourneyPipeline({
  columns,
  now,
  onOpen,
}: {
  columns: PhaseColumn[];
  now: Date;
  onOpen: (account: JourneyAccount) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {columns.map((column) => (
        <Column key={column.phase} column={column} now={now} onOpen={onOpen} />
      ))}
    </div>
  );
}
