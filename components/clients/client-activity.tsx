"use client";

/**
 * Activity & Notes.
 *
 * One chronological record of what has happened to this account, and the place
 * to add to it. It used to be a page showing a single free-text field and a
 * list of stage changes, while the activity log - which every service in the
 * application already writes to - was not shown at all.
 *
 * Nothing here is a second timeline. The rows are the ActivityLog rows, the
 * notes are ClientNote rows through the endpoint that already owned them, and
 * the stage history is the same StageHistory the journey reads. What is added
 * is a way to filter and search them, which is what makes a long list useful.
 */

import { AlertTriangle, Loader2, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  type ActivityCategory,
  type ActivityEntry,
  activityCategory,
  activityCounts,
  filterActivity,
} from "@/lib/clients/activity-feed";
import { cn, formatDateTime } from "@/lib/utils";

export interface ClientNoteRow {
  id: string;
  body: string;
  category: string;
  authorName: string | null;
  createdAt: string;
}

export interface StageChange {
  id: string;
  fromStage: string | null;
  toStage: string;
  changedByName: string | null;
  changedAt: string;
  note: string | null;
}

const CATEGORY_TONE: Record<ActivityCategory, string> = {
  note: "bg-sky-50 text-sky-700",
  journey: "bg-violet-50 text-violet-700",
  work: "bg-slate-100 text-slate-600",
  communication: "bg-emerald-50 text-emerald-700",
  approval: "bg-amber-50 text-amber-800",
  report: "bg-indigo-50 text-indigo-700",
  billing: "bg-teal-50 text-teal-700",
  integration: "bg-cyan-50 text-cyan-700",
  system: "bg-slate-100 text-slate-500",
  other: "bg-slate-100 text-slate-500",
};

export function ClientActivity({
  clientId,
  canAddNote,
  entries,
  notes,
  stageHistory,
}: {
  clientId: string;
  canAddNote: boolean;
  entries: ActivityEntry[];
  notes: ClientNoteRow[];
  stageHistory: StageChange[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<ActivityCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => activityCounts(entries), [entries]);
  const shown = useMemo(() => filterActivity(entries, filter, query), [entries, filter, query]);

  async function addNote(formData: FormData) {
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/clients/${clientId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: String(formData.get("category") ?? "GENERAL"),
          body: String(formData.get("body") ?? ""),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "That note was not saved.");
        return;
      }

      setAdding(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ notes */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Notes</h2>
            <p className="text-xs text-slate-500">
              Context somebody wrote down, kept with the account.
            </p>
          </div>
          {canAddNote ? (
            <Button
              type="button"
              size="sm"
              variant={adding ? "secondary" : "primary"}
              className="gap-1.5"
              onClick={() => setAdding((open) => !open)}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {adding ? "Cancel" : "Add note"}
            </Button>
          ) : null}
        </header>

        <div className="space-y-3 p-4">
          {adding ? (
            <form className="space-y-2 rounded-xl border border-slate-200 p-3" action={addNote}>
              <Textarea name="body" rows={3} required minLength={2} placeholder="What happened, or what somebody needs to know." />
              <div className="flex flex-wrap items-center gap-2">
                <Select name="category" defaultValue="GENERAL" className="w-44">
                  <option value="GENERAL">General</option>
                  <option value="STRATEGY">Strategy</option>
                </Select>
                <Button type="submit" size="sm" disabled={busy} className="gap-1.5">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  {busy ? "Saving..." : "Save note"}
                </Button>
              </div>
              {/*
                * Internal by default and not shown to the client anywhere.
                * There is no client-visible surface in this application, so
                * saying "internal" would imply a choice nobody can make.
                */}
              <p className="text-[11px] text-slate-400">
                Notes are internal. Strategy notes also appear on the Strategy tab.
              </p>
              {error ? (
                <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                  {error}
                </p>
              ) : null}
            </form>
          ) : null}

          {notes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
              No notes on this account yet.
            </p>
          ) : (
            notes.map((note) => (
              <article key={note.id} className="rounded-xl border border-slate-200 p-3">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{note.body}</p>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {note.authorName ?? "Unknown"} - {formatDateTime(new Date(note.createdAt))}
                  {note.category === "STRATEGY" ? " - Strategy" : ""}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      {/* --------------------------------------------------------- activity */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <header className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Activity</h2>
          <p className="text-xs text-slate-500">
            Everything the application recorded against this account, newest first.
          </p>
        </header>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                filter === "all"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              All ({entries.length})
            </button>

            {/*
              * Only the categories this account actually has. Offering ten
              * filters when eight of them are empty makes somebody click
              * through eight empty lists to learn nothing.
              */}
            {ACTIVITY_CATEGORIES.filter((category) => (counts.get(category) ?? 0) > 0).map(
              (category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setFilter(category)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    filter === category
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {ACTIVITY_CATEGORY_LABELS[category]} ({counts.get(category)})
                </button>
              ),
            )}
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the record, the person, or what changed"
              className="pl-8"
            />
          </div>

          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
              {entries.length === 0
                ? "Nothing has been recorded against this account yet."
                : "Nothing matches that."}
            </p>
          ) : (
            <ol className="space-y-1.5">
              {shown.map((entry) => {
                const category = activityCategory(entry);

                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-5 text-slate-800">{entry.action}</p>
                      {entry.fieldName ? (
                        <p className="text-[11px] text-slate-500">
                          {entry.fieldName}: {entry.previousValue ?? "-"} to {entry.newValue ?? "-"}
                        </p>
                      ) : null}
                      <p className="text-[11px] text-slate-400">
                        {entry.actorName ?? "System"} - {formatDateTime(new Date(entry.createdAt))}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        CATEGORY_TONE[category],
                      )}
                    >
                      {ACTIVITY_CATEGORY_LABELS[category]}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      {/* ----------------------------------------------------- stage history */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <header className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-950">Stage history</h2>
          <p className="text-xs text-slate-500">Every stage change, kept for accountability.</p>
        </header>

        <div className="space-y-2 p-4">
          {stageHistory.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
              This account has not changed stage yet.
            </p>
          ) : (
            stageHistory.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-slate-900">
                    {entry.fromStage ?? "Created"} to {entry.toStage}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {formatDateTime(new Date(entry.changedAt))}
                  </p>
                </div>
                <p className="text-[11px] text-slate-500">{entry.changedByName ?? "System"}</p>
                {entry.note ? (
                  <p className="mt-1 text-[11px] leading-4 text-slate-600">{entry.note}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
