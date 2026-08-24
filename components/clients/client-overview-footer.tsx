"use client";

import { Info, LoaderCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";

/** Nothing to subscribe to: the snapshot never changes after hydration. */
function subscribeToNothing() {
  return () => {};
}

/**
 * The strip under the overview: what you are looking at, and how to reload it.
 *
 * Refresh re-runs the server render rather than reloading the browser, so the
 * page keeps its scroll position and nothing half-typed elsewhere is thrown
 * away. router.refresh() is the existing pattern the rest of the app uses
 * after a mutation; this is the same thing on a button.
 */
export function ClientOverviewFooter({
  loadedAt,
  timezone,
}: {
  loadedAt: string;
  /**
   * The account's own timezone, when somebody has recorded one on the Account
   * tab. Without it the footer falls back to the reader's browser, which is
   * still true and still useful - what it must never do is name a fixed zone
   * for every account and tell somebody in Manila that times are Chicago's.
   */
  timezone?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  /*
   * Both of these belong to the machine looking at the page, so the server and
   * the browser genuinely disagree - rendering either directly is a hydration
   * mismatch, and the server's answer would be wrong anyway.
   *
   * useSyncExternalStore rather than an effect: it is built for exactly this
   * split, taking a server snapshot and a client snapshot, and it does not
   * trigger the extra render that setting state from an effect would.
   */
  const isClient = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const zone = timezone ?? (isClient ? Intl.DateTimeFormat().resolvedOptions().timeZone : null);
  const stamp = isClient
    ? new Date(refreshedAt ?? loadedAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
        ...(timezone ? { timeZone: timezone } : {}),
      })
    : null;

  function refresh() {
    startTransition(() => {
      router.refresh();
      setRefreshedAt(new Date().toISOString());
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
      <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {/*
          * The viewer's own timezone, read from the browser. There is no
          * per-account timezone stored anywhere in this application, so naming
          * a fixed one here would be decoration - and telling somebody in
          * Manila that times are shown in America/Chicago would be worse than
          * saying nothing.
          */}
        {zone ? `All times shown in ${zone}` : "All times shown in your local timezone"}
      </p>

      <div className="flex items-center gap-3">
        <p className="text-[11px] text-slate-400">
          {stamp ? `Last updated at ${stamp}` : "Loading…"}
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <>
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Refreshing…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Refresh
            </>
          )}
        </button>
      </div>
    </div>
  );
}
