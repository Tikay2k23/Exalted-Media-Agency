"use client";

import { LoaderCircle, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { AccountDialog } from "@/components/clients/account-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Nothing to subscribe to: the snapshot never changes after hydration. */
function subscribeToNothing() {
  return () => {};
}

export interface SopDetail {
  id: string;
  reference: string;
  title: string;
  summary: string | null;
  status: string;
  currentVersion: string;
  ownerName: string | null;
  approvedByName: string | null;
  content: string;
  changeNote: string | null;
  publishedAt: string | null;
  authorName: string | null;
}

/** Loads one SOP's text, which the governance page deliberately does not carry. */
function useSopDetail(sopId: string) {
  const [detail, setDetail] = useState<SopDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/governance/sops/${sopId}`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);

        if (cancelled) return;

        if (!response.ok) {
          setError((data as { error?: string } | null)?.error ?? "Could not load that SOP.");
          return;
        }

        setDetail(data as SopDetail);
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the server.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sopId]);

  return { detail, error, loading };
}

/**
 * The procedure as written.
 *
 * Markdown is shown as it was authored rather than rendered into headings and
 * bullets. These documents are the wording an audit is judged against, so what
 * is on screen should be the text itself - a renderer that quietly drops a
 * character makes a difference nobody can see.
 */
export function SopPreviewDialog({
  sopId,
  onClose,
}: {
  sopId: string;
  onClose: () => void;
}) {
  const { detail, error, loading } = useSopDetail(sopId);
  /* Same approach as AccountDialog: a value the server and browser genuinely
     disagree about, without the extra render an effect would cost. */
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

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
        aria-label={detail ? `${detail.reference} ${detail.title}` : "Standard operating procedure"}
        className="relative flex max-h-[92vh] w-full max-w-[900px] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">
              {detail ? `${detail.reference} — ${detail.title}` : "Loading…"}
            </h2>
            {detail ? (
              <p className="mt-0.5 text-xs text-slate-500">
                Version {detail.currentVersion} · {detail.status === "ACTIVE" ? "Active" : "Draft"}
                {detail.authorName ? ` · written by ${detail.authorName}` : ""}
                {detail.approvedByName ? ` · approved by ${detail.approvedByName}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              Loading the procedure…
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          {detail ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-800">
              {detail.content}
            </pre>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </footer>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

/**
 * Editing a procedure.
 *
 * This is where a procedure is actually written. Saving publishes a new
 * immutable version and drops the SOP back to Draft - the version somebody
 * approved is not the version now in the box. Nothing is overwritten, and no
 * later run of the seed script will quietly put the repository's wording back.
 */
export function SopEditDialog({
  sopId,
  onClose,
  onSaved,
}: {
  sopId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { detail, error: loadError, loading } = useSopDetail(sopId);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Seed the fields once the document arrives. */
  useEffect(() => {
    if (!detail) return;

    setTitle(detail.title);
    setBody(detail.content);
    setChangeNote("");
    setDirty(false);
  }, [detail]);

  async function save() {
    if (!detail || saving) return;

    if (!title.trim() || !body.trim()) {
      setSaveError("A procedure needs a title and its content.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/governance/sops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sopId: detail.id,
          reference: detail.reference,
          title: title.trim(),
          summary: detail.summary ?? "",
          content: body,
          changeNote: changeNote.trim() || "Edited in the app.",
        }),
      });

      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setSaveError(data?.error ?? "Could not save that change.");
        return;
      }

      onSaved();
    } catch {
      setSaveError("Could not reach the server. Nothing was saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AccountDialog
      title={detail ? `Edit ${detail.reference}` : "Edit procedure"}
      subtitle="Saving publishes a new version and returns this to Draft for approval."
      size="wide"
      isDirty={dirty}
      isSaving={saving}
      error={saveError ?? loadError}
      submitLabel="Publish new version"
      submittingLabel="Publishing…"
      onClose={onClose}
      onSubmit={save}
    >
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          Loading the procedure…
        </p>
      ) : null}

      {detail ? (
        <div className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-600">Title</span>
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setDirty(true);
              }}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-600">Procedure</span>
            <Textarea
              value={body}
              rows={20}
              className="font-mono text-xs leading-6"
              onChange={(event) => {
                setBody(event.target.value);
                setDirty(true);
              }}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-600">What changed</span>
            <Input
              value={changeNote}
              placeholder="Added the ordering rule for agency access"
              onChange={(event) => {
                setChangeNote(event.target.value);
                setDirty(true);
              }}
            />
            <span className="block text-xs leading-5 text-slate-500">
              Kept with the version, so an audit can see why the wording moved.
            </span>
          </label>

          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            This is the live procedure. Publishing keeps every earlier version and returns the
            SOP to Draft for somebody other than you to approve. The copy in{" "}
            <code>docs/sop</code> is the text this library started from; it is not updated, and
            it will not be published back over your edit.
          </p>
        </div>
      ) : null}
    </AccountDialog>
  );
}
