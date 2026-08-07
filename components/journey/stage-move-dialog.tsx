"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StageOption {
  id: string;
  name: string;
  color: string;
  position: number;
  requirementCount: number;
}

interface RequirementEvaluation {
  key: string;
  label: string;
  isBlocking: boolean;
  satisfied: boolean;
  reason: string | null;
  whatItMeans: string;
  howToFix: string;
  actionLabel: string | null;
  actionHref: string | null;
  notBuiltYet: boolean;
}

interface GateResponse {
  stageName: string;
  passed: boolean;
  evaluations: RequirementEvaluation[];
}

/** Mirrors the failure codes returned by the move endpoint. */
const MIN_OVERRIDE_REASON = 10;

export function StageMoveDialog({
  clientId,
  companyName,
  currentStageId,
  stages,
  canOverride,
  onClose,
}: {
  clientId: string;
  companyName: string;
  currentStageId: string;
  stages: StageOption[];
  canOverride: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [targetStageId, setTargetStageId] = useState<string>("");
  const [gate, setGate] = useState<GateResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Evaluating the gate is a response to the user picking a destination, so it
  // runs from the change handler rather than an effect. `requestRef` discards
  // the answer to a stage the user has already moved on from.
  const requestRef = useRef(0);

  async function selectStage(stageId: string) {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    setTargetStageId(stageId);
    setGate(null);
    setError(null);
    setOverrideReason("");
    setRiskAcknowledged(false);

    if (!stageId) {
      setIsChecking(false);
      return;
    }

    setIsChecking(true);

    try {
      const response = await fetch(
        `/api/pipeline/move?clientId=${clientId}&stageId=${stageId}`,
      );

      if (requestRef.current !== requestId) {
        return;
      }

      if (!response.ok) {
        setError("We couldn't check the stage requirements. Try again.");
        return;
      }

      setGate((await response.json()) as GateResponse);
    } catch {
      if (requestRef.current === requestId) {
        setError("We couldn't check the stage requirements. Try again.");
      }
    } finally {
      if (requestRef.current === requestId) {
        setIsChecking(false);
      }
    }
  }

  const blocking = gate?.evaluations.filter((item) => !item.satisfied && item.isBlocking) ?? [];
  const needsOverride = Boolean(gate) && blocking.length > 0;
  const overrideReady =
    overrideReason.trim().length >= MIN_OVERRIDE_REASON && riskAcknowledged;
  const canSubmit =
    Boolean(targetStageId)
    && !isChecking
    && !isPending
    && (!needsOverride || (canOverride && overrideReady));

  function submit() {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/pipeline/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          stageId: targetStageId,
          note: note.trim() || undefined,
          override: needsOverride
            ? { reason: overrideReason.trim(), riskAcknowledged: true }
            : undefined,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "We couldn't move this account.");
        return;
      }

      router.refresh();
      onClose();
    });
  }

  const availableStages = stages.filter((stage) => stage.id !== currentStageId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stage-move-title"
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[2rem] border border-slate-200 bg-white shadow-2xl sm:rounded-[2rem]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
              Client journey
            </p>
            <h2
              id="stage-move-title"
              className="mt-1 text-xl font-semibold tracking-tight text-slate-950"
            >
              Move {companyName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-600">Move to stage</span>
            <select
              value={targetStageId}
              onChange={(event) => {
                void selectStage(event.target.value);
              }}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            >
              <option value="">Select a stage...</option>
              {availableStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.position}. {stage.name}
                  {stage.requirementCount > 0
                    ? ` (${stage.requirementCount} requirement${stage.requirementCount === 1 ? "" : "s"})`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          {isChecking ? (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Checking stage requirements...
            </div>
          ) : null}

          {gate && !isChecking ? (
            <div className="space-y-4">
              {gate.passed ? (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                  <p className="text-sm leading-6 text-emerald-900">
                    Everything needed for {gate.stageName} is in place. You can move this
                    account now.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-rose-900">
                      {blocking.length} thing{blocking.length === 1 ? "" : "s"} still needed
                      before {gate.stageName}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-rose-800">
                      Each one below tells you what it means and how to sort it.
                    </p>
                  </div>
                </div>
              )}

              {/* Outstanding items first: they are what the reader came for. */}
              {gate.evaluations
                .filter((evaluation) => !evaluation.satisfied)
                .sort((a, b) => Number(b.isBlocking) - Number(a.isBlocking))
                .map((evaluation) => (
                  <div
                    key={evaluation.key}
                    className={cn(
                      "rounded-2xl border px-4 py-4",
                      evaluation.isBlocking
                        ? "border-rose-200 bg-white"
                        : "border-slate-200 bg-slate-50/60",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {evaluation.label}
                      </p>
                      {evaluation.isBlocking ? (
                        <Badge tone="rose">Blocks the move</Badge>
                      ) : (
                        <Badge tone="slate">Recommended, does not block</Badge>
                      )}
                    </div>

                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {evaluation.whatItMeans}
                    </p>

                    <div className="mt-3 rounded-xl bg-slate-100/70 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                        How to sort it
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-700">
                        {evaluation.howToFix}
                      </p>
                      {evaluation.notBuiltYet ? (
                        <p className="mt-2 text-sm leading-6 text-amber-800">
                          This screen has not been built yet, which is why this item does
                          not block the move.
                        </p>
                      ) : null}
                    </div>

                    {evaluation.actionHref && !evaluation.notBuiltYet ? (
                      <Link
                        href={evaluation.actionHref}
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 hover:text-sky-800"
                      >
                        {evaluation.actionLabel ?? "Go and fix this"}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                ))}

              {gate.evaluations.some((evaluation) => evaluation.satisfied) ? (
                <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-600">
                    {gate.evaluations.filter((evaluation) => evaluation.satisfied).length}{" "}
                    already done
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {gate.evaluations
                      .filter((evaluation) => evaluation.satisfied)
                      .map((evaluation) => (
                        <li key={evaluation.key} className="flex items-start gap-2">
                          <CheckCircle2
                            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                            aria-hidden
                          />
                          <span className="text-sm text-slate-700">{evaluation.label}</span>
                        </li>
                      ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}

          {needsOverride && !canOverride ? (
            <div className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
              <p className="text-sm leading-6 text-rose-800">
                This move is blocked and you do not have permission to override a stage
                requirement. Clear the requirements above, or ask an operations manager
                or director to authorize the move.
              </p>
            </div>
          ) : null}

          {needsOverride && canOverride ? (
            <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-4">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    You can move it anyway, but it gets recorded
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-800">
                    Use this when the work genuinely has to move on before the items above
                    are sorted. Your name, your reason, and the list of what was skipped
                    are saved against the account permanently, and the agency owner and
                    directors are notified.
                  </p>
                </div>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-amber-900">
                  Why does this need to move now?
                </span>
                <textarea
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  rows={3}
                  placeholder="Explain why this account must move before the requirements are met, and who authorized it."
                  className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                />
                <span className="text-xs text-amber-800">
                  {overrideReason.trim().length < MIN_OVERRIDE_REASON
                    ? `Write at least ${MIN_OVERRIDE_REASON} characters. "Asap" is not a reason.`
                    : "This will be saved against the account."}
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={riskAcknowledged}
                  onChange={(event) => setRiskAcknowledged(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-amber-400 text-amber-600"
                />
                <span className="text-sm leading-6 text-amber-900">
                  I understand what is being skipped and I am taking responsibility for
                  moving this account anyway.
                </span>
              </label>
            </div>
          ) : null}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-600">
              Note <span className="text-slate-400">(optional)</span>
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Context for the stage history."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            />
          </label>

          {error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit} className="gap-2">
            {isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {needsOverride ? "Override and move" : "Move account"}
          </Button>
        </div>
      </div>
    </div>
  );
}
