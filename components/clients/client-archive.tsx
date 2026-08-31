"use client";

/**
 * Archiving a client, at the end of the offboarding card.
 *
 * Placed here and nowhere else. It is the last step of the lifecycle and a
 * low-frequency management action; a button that files an account away does
 * not belong on every tab beside the ones people press all day.
 *
 * The confirmation says what actually happens rather than borrowing the
 * language of deletion. Nothing is destroyed, and telling somebody it might be
 * would either frighten them off a normal operation or teach them to ignore
 * warnings that matter.
 */

import { AlertTriangle, Archive, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export function ClientArchive({
  clientId,
  companyName,
  canArchive,
  archivedAt,
  archivedByName,
  offboardingComplete,
  outstanding,
}: {
  clientId: string;
  companyName: string;
  canArchive: boolean;
  archivedAt: string | null;
  archivedByName: string | null;
  offboardingComplete: boolean;
  /** The steps still in the way, so a refusal can name them. */
  outstanding: string[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE") {
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/clients/${clientId}/archive`, { method });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "That did not work. Nothing was changed.");
        return;
      }

      setConfirming(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  /* ----------------------------------------------------- already archived */
  if (archivedAt) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Archive className="h-4 w-4" aria-hidden />
          Archived {formatDate(archivedAt)}
          {archivedByName ? ` by ${archivedByName}` : ""}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600">
          {companyName} has left the active client lists, the journey board and the dashboard
          counts. Everything it ever had is still here and still readable.
        </p>

        {canArchive ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2 gap-1.5"
            disabled={busy}
            onClick={() => void send("DELETE")}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : (
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            )}
            Restore to active
          </Button>
        ) : null}

        {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      </div>
    );
  }

  if (!canArchive) return null;

  /* ------------------------------------------------------ not ready yet */
  if (!offboardingComplete) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-3">
        <p className="text-sm font-medium text-slate-700">Archive when offboarding is finished</p>
        {/*
          * The exact reasons, not a disabled button. Somebody who cannot see
          * why has to guess, and guessing at a lifecycle step is how an
          * account gets filed with an invoice still owed on it.
          */}
        {outstanding.length > 0 ? (
          <>
            <p className="mt-1 text-xs text-slate-500">
              {outstanding.length} step{outstanding.length === 1 ? "" : "s"} still outstanding:
            </p>
            <ul className="mt-1 space-y-0.5">
              {outstanding.map((step) => (
                <li key={step} className="flex items-start gap-1.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {step}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Set the offboarding status to complete first.
          </p>
        )}
      </div>
    );
  }

  /* ---------------------------------------------------------- ready */
  return (
    <div className="rounded-2xl border border-slate-200 px-4 py-3">
      {confirming ? (
        <>
          <p className="text-sm font-semibold text-slate-900">Archive {companyName}?</p>
          <ul className="mt-1.5 space-y-0.5 text-xs leading-5 text-slate-600">
            <li>They leave the active client lists, the journey board and the dashboard counts.</li>
            <li>
              Every record stays: work, journey history, approvals, reports, invoices, payments,
              files and activity.
            </li>
            <li>This does not delete the client, and it can be undone.</li>
          </ul>

          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => void send("POST")}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : (
                <Archive className="h-3.5 w-3.5" aria-hidden />
              )}
              {busy ? "Archiving..." : "Archive client"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-700">Offboarding is complete</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Archiving files the account away without deleting anything.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2 gap-1.5"
            onClick={() => setConfirming(true)}
          >
            <Archive className="h-3.5 w-3.5" aria-hidden />
            Archive client
          </Button>
        </>
      )}

      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
