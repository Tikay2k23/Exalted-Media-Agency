"use client";

import { CalendarCheck, LoaderCircle, PencilLine, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SopEditDialog } from "@/components/governance/sop-dialogs";
import { Button } from "@/components/ui/button";

/**
 * The governed actions on one procedure.
 *
 * There is no separate "new version" operation to wire up: saving the editor
 * publishes a new immutable version and returns the SOP to Draft. So the
 * primary button is the same editor either way, and only its label changes -
 * "New version" once a document is approved, because that is what pressing it
 * will do to an approved document, and "Edit SOP" while it is still a draft
 * nobody has signed off. Two buttons calling one endpoint would just be two
 * names for the same thing.
 *
 * Every button here is also a server-side check. `canManage` decides what is
 * on screen; the API refuses regardless, including the rule that the author of
 * a version cannot approve it.
 */
export function SopDetailActions({
  sopId,
  reference,
  nextVersionLabel,
  canManage,
  status,
  isAuthorOfCurrent,
}: {
  sopId: string;
  reference: string;
  /** The version in force now, used to say what the next one supersedes. */
  nextVersionLabel: string;
  canManage: boolean;
  status: string;
  isAuthorOfCurrent: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<null | "activate" | "review">(null);
  const [error, setError] = useState<string | null>(null);

  if (!canManage) {
    return null;
  }

  const isActive = status === "ACTIVE";

  async function act(action: "activate" | "review") {
    setBusy(action);
    setError(null);

    try {
      const response = await fetch(`/api/governance/sops/${sopId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(data?.error ?? "That did not work.");
        return;
      }

      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Reviewed, still current: confirms the procedure without publishing
            a version nobody actually changed. */}
        {isActive ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => act("review")}
            disabled={busy !== null}
          >
            {busy === "review" ? (
              <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <CalendarCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            Reviewed, still current
          </Button>
        ) : isAuthorOfCurrent ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            You wrote this version, so somebody else approves it
          </span>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={() => act("activate")}
            disabled={busy !== null}
          >
            {busy === "activate" ? (
              <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            Approve version {nextVersionLabel}
          </Button>
        )}

        <Button type="button" onClick={() => setEditing(true)}>
          <PencilLine className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {isActive ? "New version" : "Edit SOP"}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      {editing ? (
        <SopEditDialog
          sopId={sopId}
          headingVerb={isActive ? "New version of" : "Edit"}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : null}

      <span className="sr-only">{reference}</span>
    </div>
  );
}
