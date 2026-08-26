"use client";

import { ArrowRight, Check, Loader2, ShieldAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  FLAG_LABELS,
  type FlagKind,
  type JourneyClientDetail,
} from "@/lib/journey/client-detail";
import { requirementSort } from "@/lib/journey/journey-board";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

function Modal({
  title,
  eyebrow,
  onClose,
  footer,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400">
              {eyebrow}
            </p>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:justify-end">
          {footer}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

const fieldClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const areaClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Advance stage                                                              */
/* -------------------------------------------------------------------------- */

const MIN_OVERRIDE_REASON = 10;

/**
 * The gate, shown before the move rather than after it.
 *
 * The move itself goes through the same endpoint every other stage change
 * uses, so the requirement evaluation, the override recording and the history
 * entry are the existing ones. What this adds is that a project manager sees
 * exactly what is unmet before committing, instead of discovering it from a
 * refusal.
 */
export function AdvanceStageDialog({
  detail,
  onClose,
}: {
  detail: JourneyClientDetail;
  onClose: () => void;
}) {
  const router = useRouter();
  const { account } = detail;

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const inFlight = useRef(false);

  const blocking = account.exitCriteria.filter(
    (requirement) => !requirement.satisfied && requirement.isBlocking,
  );
  const ready = blocking.length === 0;
  const sorted = [...account.exitCriteria].sort(requirementSort);

  async function move(withOverride: boolean) {
    if (inFlight.current) return;

    inFlight.current = true;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/pipeline/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: account.id,
          stageId: account.nextStageId,
          ...(withOverride
            ? { override: { reason: reason.trim(), riskAcknowledged: acknowledged } }
            : {}),
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "That move did not save.");
        return;
      }

      router.refresh();
      onClose();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const overrideValid =
    reason.trim().length >= MIN_OVERRIDE_REASON && acknowledged;

  return (
    <Modal
      eyebrow="Advance stage"
      title={`Move to ${account.nextStageName}?`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          {ready ? (
            <Button onClick={() => void move(false)} disabled={saving} className="gap-1.5">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              Move to {account.nextStageName}
            </Button>
          ) : overriding ? (
            <Button
              variant="danger"
              onClick={() => void move(true)}
              disabled={saving || !overrideValid}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              Override &amp; Continue
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose} className="gap-1.5">
              Open Missing Requirement
            </Button>
          )}
        </>
      }
    >
      {error ? (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Current stage</p>
          <p className="mt-0.5 text-sm font-medium text-slate-800">{account.stageName}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Next stage</p>
          <p className="mt-0.5 text-sm font-medium text-slate-800">
            {account.nextStageName}
          </p>
        </div>
      </div>

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Exit requirements
      </p>

      {sorted.length === 0 ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Nothing gates the move into {account.nextStageName}.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {sorted.map((requirement) => (
            <li key={requirement.key} className="flex items-start gap-2">
              {requirement.satisfied ? (
                <Check
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600"
                  strokeWidth={3}
                  aria-hidden
                />
              ) : (
                <X
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    requirement.isBlocking ? "text-rose-600" : "text-amber-600",
                  )}
                  strokeWidth={3}
                  aria-hidden
                />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-xs leading-4",
                    requirement.satisfied ? "text-slate-400" : "text-slate-800",
                  )}
                >
                  {requirement.label}
                </span>
                {!requirement.satisfied && requirement.reason ? (
                  <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">
                    {requirement.reason}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {ready ? (
        <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium leading-4 text-emerald-800">
          <Check className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden />
          All requirements for this stage are complete.
        </p>
      ) : (
        <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium leading-4 text-amber-900">
          <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {blocking.length} requirement{blocking.length === 1 ? "" : "s"} still need
          {blocking.length === 1 ? "s" : ""} attention.
        </p>
      )}

      {!ready && detail.canOverride ? (
        overriding ? (
          <div className="mt-4 space-y-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
            <Field
              label="Override reason"
              hint={`At least ${MIN_OVERRIDE_REASON} characters. Recorded against the move with your name and the time.`}
            >
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why this account may move with requirements outstanding."
                className={areaClass}
              />
            </Field>

            <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-4 text-rose-900">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 accent-rose-600"
              />
              I accept the risk of advancing with {blocking.length} requirement
              {blocking.length === 1 ? "" : "s"} unmet.
            </label>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOverriding(true)}
            className="mt-3 text-[11px] font-semibold text-rose-700 underline-offset-2 hover:underline"
          >
            Override &amp; Continue anyway
          </button>
        )
      ) : null}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Secondary status                                                           */
/* -------------------------------------------------------------------------- */

/** What each condition has to record before it is worth anything to anybody. */
const FLAG_FIELDS: Record<
  FlagKind,
  { reason: string; detail: string; party: string; due: string; round: boolean }
> = {
  WAITING_ON_CLIENT: {
    reason: "What are you waiting for?",
    detail: "What exactly is needed",
    party: "Who has to provide it",
    due: "Follow-up date",
    round: false,
  },
  BLOCKED: {
    reason: "What is blocking this?",
    detail: "What would unblock it",
    party: "Responsible party",
    due: "Expected resolution",
    round: false,
  },
  REVISIONS_REQUIRED: {
    reason: "What was asked for?",
    detail: "The revision request",
    party: "Responsible specialist",
    due: "Due date",
    round: true,
  },
  PAUSED: {
    reason: "Why is this paused?",
    detail: "Anything the team should know",
    party: "Paused by",
    due: "Expected resume date",
    round: false,
  },
};

export function JourneyFlagDialog({
  clientId,
  kind,
  onClose,
}: {
  clientId: string;
  kind: FlagKind;
  onClose: () => void;
}) {
  const router = useRouter();
  const fields = FLAG_FIELDS[kind];

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function submit(formData: FormData) {
    if (inFlight.current) return;

    inFlight.current = true;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/clients/${clientId}/journey-flags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "raise",
          kind,
          reason: String(formData.get("reason") ?? "").trim(),
          detail: String(formData.get("detail") ?? "").trim() || null,
          responsibleParty: String(formData.get("party") ?? "").trim() || null,
          dueAt: String(formData.get("due") ?? "") || null,
          round: fields.round
            ? Number(String(formData.get("round") ?? "1")) || 1
            : null,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "That did not save.");
        return;
      }

      router.refresh();
      onClose();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal
      eyebrow="Secondary status"
      title={FLAG_LABELS[kind]}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="flag-form" disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </>
      }
    >
      <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600">
        This sits on top of the journey stage. The client stays in{" "}
        <span className="font-medium text-slate-800">the same stage</span> and comes off
        this list as soon as it is cleared.
      </p>

      {error ? (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
      ) : null}

      <form id="flag-form" action={submit} className="space-y-3">
        <Field label={fields.reason}>
          <input name="reason" required minLength={3} className={fieldClass} />
        </Field>

        <Field label={fields.detail}>
          <textarea name="detail" rows={2} className={areaClass} />
        </Field>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <Field label={fields.party}>
            <input name="party" className={fieldClass} />
          </Field>
          <Field label={fields.due}>
            <input name="due" type="date" className={fieldClass} />
          </Field>
        </div>

        {fields.round ? (
          <Field label="Revision round">
            <input
              name="round"
              type="number"
              min="1"
              max="50"
              defaultValue="1"
              className={fieldClass}
            />
          </Field>
        ) : null}
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Health explanation                                                         */
/* -------------------------------------------------------------------------- */

export function HealthDialog({
  label,
  color,
  reasons,
  score,
  factors,
  onClose,
}: {
  label: string;
  color: string;
  reasons: string[];
  /** 0-100, weighted over the factors that applied to this account. */
  score: number;
  factors: { key: string; label: string; score: number; weight: number; detail: string }[];
  onClose: () => void;
}) {
  return (
    <Modal
      eyebrow="Client health"
      title={label}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <p className="text-sm font-semibold text-slate-900">{label}</p>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-slate-950">{score}</span>
        <span className="text-xs text-slate-500">out of 100</span>
      </div>

      {factors.length > 0 ? (
        <>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            What moved it
          </p>
          <ul className="mt-2 space-y-2">
            {factors.map((factor) => (
              <li key={factor.key} className="text-xs">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">{factor.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {factor.score} · weight {factor.weight}
                  </span>
                </span>
                <span className="mt-0.5 block text-slate-600">{factor.detail}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {reasons.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-slate-600">
          Nothing is overdue, blocked or outstanding on this account.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Reasons
          </p>
          <ul className="mt-2 space-y-1.5">
            {reasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2 text-xs leading-4 text-slate-700">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
                {reason}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/**
 * The next stage, read only.
 *
 * Opened from Upcoming Stage. It used to open the advance dialog, which is the
 * one thing a preview must not do: somebody looking at what comes next was one
 * button away from going there. Nothing here mutates.
 */
export function StagePreviewDialog({
  stageName,
  entryActions,
  onClose,
}: {
  stageName: string;
  entryActions: { title: string; note: string }[];
  onClose: () => void;
}) {
  return (
    <Modal
      eyebrow="Upcoming stage"
      title={stageName}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <p className="text-xs leading-5 text-slate-600">
        Nothing on this panel changes the journey. It shows what entering{" "}
        {stageName} will set in motion.
      </p>

      {entryActions.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          Entering this stage creates no automatic work.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Entry actions ({entryActions.length})
          </p>
          <ul className="mt-2 space-y-2">
            {entryActions.map((action) => (
              <li key={action.title} className="rounded-lg border border-slate-200 p-2.5">
                <p className="text-xs font-medium text-slate-900">{action.title}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-600">{action.note}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
