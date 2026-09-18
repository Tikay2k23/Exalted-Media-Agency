"use client";

import { LoaderCircle, UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * The three things a task gained with department teams: the SOP it follows, a
 * checklist, and reassignment. Kept out of task-detail-modal so the modal's own
 * logic stays as it was - it only places these.
 */

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/**
 * Ticking steps off.
 *
 * Optimistic, because a checkbox that waits on the network feels broken - but
 * it puts the box back if the server refuses. A reference aid only: ticking
 * never completes a stage gate, QA test or approval.
 */
export function ChecklistBlock({
  taskId,
  initial,
}: {
  taskId: string;
  initial: TaskChecklistItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function toggle(itemId: string, done: boolean) {
    const previous = items;
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, done } : item)));
    setError(null);

    try {
      const response = await fetch(`/api/employee-tasks/${taskId}/checklist`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, done }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setItems(previous);
        setError(data?.error ?? "That did not save.");
        return;
      }

      router.refresh();
    } catch {
      setItems(previous);
      setError("Could not reach the server.");
    }
  }

  const done = items.filter((item) => item.done).length;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-900">
        Checklist{" "}
        <span className="font-normal text-slate-500">
          {done} of {items.length}
        </span>
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-700">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(event) => toggle(item.id, event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className={item.done ? "text-slate-400 line-through" : undefined}>{item.text}</span>
            </label>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-1 text-[11px] text-rose-700">{error}</p> : null}
    </div>
  );
}

/**
 * Handing the task to somebody else.
 *
 * Only offered to people who may reassign, and only to the people they may
 * reassign to - both worked out on the server and checked again there.
 */
export function ReassignControl({
  taskId,
  currentAssigneeId,
  options,
  onDone,
}: {
  taskId: string;
  currentAssigneeId: string | null;
  options: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choices = options.filter((option) => option.id !== currentAssigneeId);

  if (!choices.length) return null;

  async function reassign() {
    if (!target || saving) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/employee-tasks/${taskId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: target }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(data?.error ?? "That did not work.");
        return;
      }

      router.refresh();
      onDone();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <UserRoundCog className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Reassign
      </Button>
    );
  }

  return (
    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          aria-label="Reassign to"
          className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="">Reassign to…</option>
          {choices.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={reassign} disabled={!target || saving}>
          {saving ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Reassign
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
      {error ? <p className="text-[11px] text-rose-700">{error}</p> : null}
    </div>
  );
}
