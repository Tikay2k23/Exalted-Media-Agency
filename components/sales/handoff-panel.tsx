"use client";

import {
  ArrowRight,
  BadgeCheck,
  CircleAlert,
  Clock3,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * What happened to a won opportunity, and the one thing left to do about it.
 *
 * The opportunity stays in Sales permanently - this panel is what turns it
 * from an open deal into a record of one, without the sales representative
 * having to manage delivery from here. Each state offers exactly one action,
 * because at any point there is only one.
 */
export function HandoffPanel({
  leadId,
  handoffState,
  clientId,
  canConfirmPayment,
  canRetry,
}: {
  leadId: string;
  handoffState: string | null;
  clientId: string | null;
  canConfirmPayment: boolean;
  canRetry: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!handoffState) return null;

  async function act(action: "confirm-payment" | "retry") {
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/leads/${leadId}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error ?? "That did not work. Try again in a moment.");
        return;
      }

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const awaiting = handoffState === "AWAITING_PAYMENT";
  const failed = handoffState === "FAILED";
  const running = handoffState === "RUNNING";

  const tone = failed
    ? "border-rose-200 bg-rose-50"
    : awaiting
      ? "border-amber-200 bg-amber-50"
      : "border-emerald-200 bg-emerald-50";

  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start gap-2.5">
        {failed ? (
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
        ) : awaiting || running ? (
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        ) : (
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {failed
              ? "Handoff incomplete"
              : awaiting
                ? "Won - awaiting payment"
                : running
                  ? "Handoff in progress"
                  : "Converted to Client"}
          </p>

          <p className="mt-1 text-xs leading-5 text-slate-600">
            {failed
              ? "Some steps completed and some did not. Retrying resumes at the step that failed and will not create anything twice."
              : awaiting
                ? "The win is recorded and this deal counts in Sales. Delivery starts when the payment is confirmed."
                : running
                  ? "The client, journey and onboarding work are being created."
                  : "Delivery owns this account now. The sales record stays here for history and reporting."}
          </p>

          {error ? (
            <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {clientId ? (
              <Link href={`/clients/${clientId}`}>
                <Button size="sm" variant="secondary" className="gap-1.5">
                  Open Client
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : null}

            {clientId && !awaiting && !failed ? (
              <Link href="/journey">
                <Button size="sm" variant="secondary" className="gap-1.5">
                  Open Journey
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : null}

            {awaiting && canConfirmPayment ? (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() => void act("confirm-payment")}
              >
                {busy ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BadgeCheck className="h-3.5 w-3.5" />
                )}
                Confirm payment
              </Button>
            ) : null}

            {failed && canRetry ? (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() => void act("retry")}
              >
                {busy ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Retry handoff
              </Button>
            ) : null}
          </div>

          {awaiting && !canConfirmPayment ? (
            <p className="mt-2 text-xs text-slate-500">
              The agency owner confirms the payment. Delivery starts as soon as
              they do.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
