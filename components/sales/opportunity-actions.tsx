"use client";

import { LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SalesStage } from "@/lib/data/sales-workspace-query";
import { dealValue, opportunityLabel, type SalesLead } from "@/lib/sales/sales-view";

/** The quick moves, each one a small form over the same actions endpoint. */
export type ActionKind =
  | "next-step"
  | "follow-up"
  | "call"
  | "proposal"
  | "won"
  | "lost"
  | "nurture"
  | "stage";

const TITLES: Record<ActionKind, { title: string; hint: string; verb: string }> = {
  "next-step": {
    title: "Set the next action",
    hint: "What happens next, in your own words.",
    verb: "Save",
  },
  "follow-up": {
    title: "Schedule the follow up",
    hint: "When you will come back to this.",
    verb: "Schedule",
  },
  call: {
    title: "Strategy call",
    hint: "Book it, or record what happened.",
    verb: "Save",
  },
  proposal: {
    title: "Record the proposal",
    hint: "The date it went out starts the clock on it.",
    verb: "Record",
  },
  won: {
    title: "Mark won",
    hint: "Links the existing client account when the agency already has one, rather than creating a second.",
    verb: "Mark won",
  },
  lost: {
    title: "Mark lost",
    hint: "The reason is required. Lost with no reason teaches nobody anything.",
    verb: "Mark lost",
  },
  nurture: {
    title: "Move to long-term nurture",
    hint: "Parked, not dead. It comes back when the date arrives.",
    verb: "Park it",
  },
  stage: { title: "Move stage", hint: "Where this deal actually is.", verb: "Move" },
};

const LOST_REASONS = [
  ["NO_RESPONSE", "No response"],
  ["NO_BUDGET", "No budget"],
  ["NOT_INTERESTED", "Not interested"],
  ["WENT_WITH_COMPETITOR", "Went with a competitor"],
  ["BAD_FIT", "Bad fit"],
  ["OUTSIDE_SERVICE_AREA", "Outside service area"],
  ["TIMING", "Timing"],
  ["DUPLICATE_LEAD", "Duplicate"],
  ["OTHER", "Other"],
] as const;

const CALL_STATUSES = [
  ["BOOKED", "Booked"],
  ["SHOWED", "Showed"],
  ["NO_SHOW", "No show"],
  ["CANCELLED", "Cancelled"],
  ["RESCHEDULED", "Rescheduled"],
] as const;

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

/**
 * One dialog for every quick sales move.
 *
 * They are all the same shape - a couple of fields and one POST - so they are
 * one component rather than eight. Each one posts to the same actions endpoint
 * the board uses, so a stage set from this menu goes through exactly the rules
 * a dragged card does.
 */
export function OpportunityActionDialog({
  kind,
  lead,
  stages,
  onClose,
}: {
  kind: ActionKind;
  lead: SalesLead;
  stages: SalesStage[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nextAction, setNextAction] = useState(lead.nextAction ?? "");
  const [followUpAt, setFollowUpAt] = useState(lead.nextFollowUpAt?.slice(0, 16) ?? "");
  const [callAt, setCallAt] = useState(lead.strategyCallAt?.slice(0, 16) ?? "");
  const [callStatus, setCallStatus] = useState(lead.strategyCallStatus ?? "BOOKED");
  const [amount, setAmount] = useState(String(dealValue(lead) || ""));
  const [reason, setReason] = useState("NO_RESPONSE");
  const [note, setNote] = useState("");
  const [until, setUntil] = useState("");
  const [stageId, setStageId] = useState(lead.stageId ?? "");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function bodyFor(): Record<string, unknown> | { error: string } {
    switch (kind) {
      case "next-step":
        return { action: "next-step", nextAction: nextAction.trim() || null };
      case "follow-up":
        return {
          action: "next-step",
          nextFollowUpAt: followUpAt || null,
          ...(nextAction.trim() ? { nextAction: nextAction.trim() } : {}),
        };
      case "call":
        if (!callAt) return { error: "Pick a date and time for the call." };
        return { action: "strategy-call", at: callAt, status: callStatus };
      case "proposal":
        return {
          action: "proposal-sent",
          value: amount === "" ? null : Number(amount),
        };
      case "won":
        return { action: "mark-won", finalValue: amount === "" ? null : Number(amount) };
      case "lost":
        if (reason === "OTHER" && !note.trim()) {
          return { error: "Describe it under Other, or choose a reason." };
        }
        return { action: "mark-lost", reason, note: note.trim() || null };
      case "nurture":
        if (!until) return { error: "Pick the date it should come back." };
        return { action: "nurture", until, reason: note.trim() || null };
      case "stage": {
        const stage = stages.find((candidate) => candidate.id === stageId);

        if (!stage?.stageKey) return { error: "Pick a stage." };

        return { action: "move-stage", stageKey: stage.stageKey };
      }
    }
  }

  async function save() {
    const body = bodyFor();

    if ("error" in body) {
      setError(body.error as string);
      return;
    }

    setSaving(true);
    setError(null);

    const response = await fetch(`/api/leads/${lead.id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "That didn't save.");
      return;
    }

    startTransition(() => router.refresh());
    onClose();
  }

  const meta = TITLES[kind];

  const content = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">{meta.title}</h2>
            <p className="truncate text-xs text-slate-500">{opportunityLabel(lead)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 p-5">
          <p className="text-xs text-slate-500">{meta.hint}</p>

          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          ) : null}

          {kind === "next-step" || kind === "follow-up" ? (
            <Labelled label="Next action">
              <Input
                className="h-9 text-sm"
                value={nextAction}
                onChange={(event) => setNextAction(event.target.value)}
                placeholder="Call the decision maker"
              />
            </Labelled>
          ) : null}

          {kind === "follow-up" ? (
            <Labelled label="Next follow up">
              <Input
                type="datetime-local"
                className="h-9 text-sm"
                value={followUpAt}
                onChange={(event) => setFollowUpAt(event.target.value)}
              />
            </Labelled>
          ) : null}

          {kind === "call" ? (
            <>
              <Labelled label="Call date and time">
                <Input
                  type="datetime-local"
                  className="h-9 text-sm"
                  value={callAt}
                  onChange={(event) => setCallAt(event.target.value)}
                />
              </Labelled>
              <Labelled label="Outcome">
                <Select
                  className="h-9 text-sm"
                  value={callStatus}
                  onChange={(event) => setCallStatus(event.target.value)}
                >
                  {CALL_STATUSES.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </Select>
              </Labelled>
            </>
          ) : null}

          {kind === "proposal" || kind === "won" ? (
            <Labelled label={kind === "won" ? "Final value" : "Proposal value"}>
              <Input
                type="number"
                min={0}
                className="h-9 text-sm"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Labelled>
          ) : null}

          {kind === "lost" ? (
            <>
              <Labelled label="Reason">
                <Select
                  className="h-9 text-sm"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                >
                  {LOST_REASONS.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </Select>
              </Labelled>
              <Labelled label={reason === "OTHER" ? "What happened (required)" : "Note"}>
                <Textarea
                  rows={3}
                  className="text-sm"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Labelled>
            </>
          ) : null}

          {kind === "nurture" ? (
            <>
              <Labelled label="Come back on">
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                />
              </Labelled>
              <Labelled label="Why, and what to do then">
                <Textarea
                  rows={3}
                  className="text-sm"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Labelled>
            </>
          ) : null}

          {kind === "stage" ? (
            <Labelled label="Stage">
              <Select
                className="h-9 text-sm"
                value={stageId}
                onChange={(event) => setStageId(event.target.value)}
              >
                <option value="">Choose a stage…</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </Select>
            </Labelled>
          ) : null}

          {kind === "won" ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
              The sales history stays on this opportunity after the handover, so it can still
              answer who closed it, when, and for how much.
            </p>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {meta.verb}
          </Button>
        </footer>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
