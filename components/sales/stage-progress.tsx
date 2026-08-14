"use client";

import {
  BadgeCheck,
  CalendarCheck,
  FileText,
  Handshake,
  Inbox,
  Phone,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { stageProgress, type ColumnKey, type ProgressState } from "@/lib/sales/pipeline-board";
import { opportunityLabel, type SalesLead } from "@/lib/sales/sales-view";

/**
 * How far along a deal is, as seven icons.
 *
 * Distinct from the activity icons underneath it, and deliberately so: this
 * strip says where the opportunity has got to, those say what has been done to
 * it. Merging them would produce a row where a lit phone might mean "reached
 * the Contacted stage" or "somebody logged a call", which is two facts sharing
 * one symbol.
 *
 * Every state comes from stageProgress(), which reads the stage - so the strip
 * cannot disagree with the column the card is sitting in.
 */

const ICONS: Record<ColumnKey, LucideIcon> = {
  "new-lead": Inbox,
  contacted: Phone,
  "strategy-call": CalendarCheck,
  qualified: BadgeCheck,
  proposal: FileText,
  negotiation: Handshake,
  won: Trophy,
};

/**
 * Quiet on purpose.
 *
 * Completed is a soft brand tone rather than a second highlight, so the one
 * icon with a filled background is unambiguously where the deal is now. Won
 * gets green because it is an outcome, not a step.
 */
const STATE_STYLES: Record<ProgressState, string> = {
  upcoming: "text-slate-300",
  completed: "text-sky-400",
  active: "bg-slate-900 text-white shadow-sm",
};

const WON_ACTIVE = "bg-emerald-600 text-white shadow-sm";

export function StageProgress({
  lead,
  canMove,
  onPick,
  size = "sm",
}: {
  lead: SalesLead;
  canMove: boolean;
  /** Given the column picked. Won routes to the win confirmation, not a move. */
  onPick?: (column: ColumnKey, stageKey: string, label: string) => void;
  size?: "sm" | "md";
}) {
  const steps = stageProgress(lead);
  const interactive = canMove && Boolean(onPick);

  return (
    <div
      className="flex items-center gap-0.5"
      role="group"
      aria-label={`Sales progress for ${opportunityLabel(lead)}`}
    >
      {steps.map((step, index) => {
        const Icon = ICONS[step.key];
        const isWon = step.key === "won";
        const tone =
          step.state === "active" && isWon ? WON_ACTIVE : STATE_STYLES[step.state];

        const title =
          step.state === "active"
            ? `Currently in ${step.label}`
            : step.state === "completed"
              ? `${step.label} — done`
              : interactive
                ? `Move to ${step.label}`
                : step.label;

        const shape = `inline-flex items-center justify-center rounded-md ${
          size === "md" ? "h-7 w-7" : "h-5 w-5"
        } ${tone}`;

        return (
          <span key={step.key} className="flex items-center">
            {index > 0 ? (
              <span
                aria-hidden
                className={`h-px w-1 ${
                  step.state === "upcoming" ? "bg-slate-200" : "bg-sky-200"
                }`}
              />
            ) : null}

            {interactive && step.state !== "active" ? (
              <button
                type="button"
                title={title}
                aria-label={title}
                onClick={(event) => {
                  // The card behind this opens the drawer; without this a stage
                  // click would also open it and hide its own confirmation.
                  event.stopPropagation();
                  onPick!(step.key, step.stageKey, step.label);
                }}
                className={`${shape} transition hover:ring-2 hover:ring-slate-900/10`}
              >
                <Icon className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
              </button>
            ) : (
              <span title={title} aria-label={title} className={shape}>
                <Icon className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
