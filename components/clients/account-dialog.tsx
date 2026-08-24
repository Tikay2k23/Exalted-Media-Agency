"use client";

import { LoaderCircle, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * The shell the Account tab's four editors share.
 *
 * Every dialog in this application currently builds its own portal, overlay,
 * escape handler and footer. Four more copies for one tab is four more places
 * for the close button to behave differently, so the Account editors share this
 * instead - the existing dialogs are left exactly as they are.
 *
 * The close guard is the part worth having in one place: a dialog that throws
 * away a half-typed address because somebody clicked the backdrop is a bug
 * people only report after losing something. `isDirty` decides whether closing
 * needs confirming, so an untouched form still shuts on the first click.
 */
/** Nothing to subscribe to: the snapshot never changes after hydration. */
function subscribeToNothing() {
  return () => {};
}

export function AccountDialog({
  title,
  subtitle,
  isDirty,
  isSaving,
  error,
  submitLabel = "Save changes",
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  subtitle?: string;
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const [confirmingClose, setConfirmingClose] = useState(false);

  /*
   * createPortal needs document.body, which does not exist during the server
   * render. useSyncExternalStore rather than setting state in an effect: it is
   * built for a value the server and the browser genuinely disagree about, and
   * it does not trigger the extra render an effect would.
   */
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  /*
   * Declared before the effect that uses it, and wrapped, so the listener is
   * never reading a stale closure over isDirty - escaping out of a form you
   * have just typed into has to prompt, not discard.
   */
  const attemptClose = useCallback(() => {
    if (isSaving) return;

    if (isDirty) {
      setConfirmingClose(true);
      return;
    }

    onClose();
  }, [isDirty, isSaving, onClose]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") attemptClose();
    }

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [attemptClose]);

  if (!mounted) return null;

  const content = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={attemptClose}
        className="absolute inset-0 bg-slate-950/60"
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">{title}</h2>
            {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={attemptClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!isSaving) onSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {error ? (
            <p
              role="alert"
              className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-xs text-rose-700"
            >
              {error}
            </p>
          ) : null}

          <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <Button type="button" variant="secondary" onClick={attemptClose} disabled={isSaving}>
              Cancel
            </Button>
            {/* Disabled while saving, so a double-click cannot submit twice. */}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </footer>
        </form>

        {confirmingClose ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/95 p-6">
            <div className="max-w-sm text-center">
              <p className="text-sm font-semibold text-slate-950">Discard your changes?</p>
              <p className="mt-1 text-xs text-slate-600">
                You have edits here that have not been saved.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmingClose(false)}
                >
                  Keep editing
                </Button>
                <Button type="button" onClick={onClose}>
                  Discard
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

/** Label above a control, the shape every editor here uses. */
export function DialogField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      {hint ? <span className="mt-0.5 block text-[11px] text-slate-400">{hint}</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
