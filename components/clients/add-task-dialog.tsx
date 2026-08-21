"use client";

import { LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * A task on this client, through the agency's one task system.
 *
 * Posts to /api/employee-tasks - the same endpoint the assignment form uses -
 * so the task lands in the assignee's My Work, the workload reports and the
 * client's own delivery list at once. A second create path would have produced
 * tasks that only this page could see.
 *
 * The submission key is generated once per open dialog and sent with the
 * request: the endpoint treats a repeat inside its dedupe window as the same
 * submission, so a double-click cannot make two tasks.
 */

const CATEGORIES = [
  "LEAD_GENERATION_AND_OUTREACH",
  "CONTENT_PLANNING",
  "COPYWRITING",
  "CREATIVE_DESIGN",
  "VIDEO_PRODUCTION",
  "PAID_MEDIA",
  "SEO",
  "SOCIAL_MEDIA",
  "EMAIL_AND_SMS_MARKETING",
  "CRM_AND_AUTOMATION",
  "FUNNELS_AND_LANDING_PAGES",
  "WEBSITE_UPDATES",
  "ANALYTICS_AND_TRACKING",
  "CLIENT_REPORTING",
  "REPUTATION_MANAGEMENT",
  "INTEGRATIONS",
  "CLIENT_MANAGEMENT",
  "INTERNAL_OPERATIONS",
] as const;

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Field({
  label: text,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-slate-600">
        {text}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

export function AddTaskDialog({
  clientId,
  companyName,
  assignees,
  onClose,
}: {
  clientId: string;
  companyName: string;
  assignees: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // One key per open dialog, so retries of the same submission are recognised
  // but a deliberate second task is not.
  const submissionKey = useId();

  const [form, setForm] = useState({
    title: "",
    note: "",
    assignedToId: assignees[0]?.id ?? "",
    dueDate: "",
    priority: "MEDIUM",
    category: "CLIENT_MANAGEMENT",
    estimatedHours: "2",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (saving) return;

    if (form.title.trim().length < 2) {
      setError("Give the task a title.");
      return;
    }

    if (!form.assignedToId) {
      setError("Choose who is doing it.");
      return;
    }

    if (!form.dueDate) {
      setError("A task needs a due date.");
      return;
    }

    setSaving(true);
    setError(null);

    const response = await fetch("/api/employee-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        note: form.note.trim(),
        assignedToId: form.assignedToId,
        dueDate: form.dueDate,
        priority: form.priority,
        category: form.category,
        estimatedHours: Number(form.estimatedHours) || 2,
        status: "TODO",
        clientId,
        submissionKey,
      }),
    });

    setSaving(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "That task didn't save.");
      return;
    }

    /*
     * Refresh rather than patch: the open-work counts, the attention reasons
     * and the delivery table are all derived from the server rows, so the
     * server has to be the thing that moves.
     */
    startTransition(() => router.refresh());
    onClose();
  }

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
        className="relative w-full max-w-lg overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950">Add a task</h2>
            <p className="truncate text-xs text-slate-500">On {companyName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 p-5">
          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          ) : null}

          <Field label="What needs doing" required>
            <Input
              className="h-9 text-sm"
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="Chase the Meta Business Manager invite"
            />
          </Field>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            <Field label="Assign to" required>
              <Select
                className="h-9 text-sm"
                value={form.assignedToId}
                onChange={(event) => set("assignedToId", event.target.value)}
              >
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Due date" required>
              <Input
                type="date"
                className="h-9 text-sm"
                value={form.dueDate}
                onChange={(event) => set("dueDate", event.target.value)}
              />
            </Field>

            <Field label="Category">
              <Select
                className="h-9 text-sm"
                value={form.category}
                onChange={(event) => set("category", event.target.value)}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {label(category)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Priority">
              <Select
                className="h-9 text-sm"
                value={form.priority}
                onChange={(event) => set("priority", event.target.value)}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {label(priority)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Estimated hours">
              <Input
                type="number"
                min={1}
                max={40}
                className="h-9 text-sm"
                value={form.estimatedHours}
                onChange={(event) => set("estimatedHours", event.target.value)}
              />
            </Field>
          </div>

          <Field label="Notes">
            <Textarea
              rows={3}
              className="text-sm"
              value={form.note}
              onChange={(event) => set("note", event.target.value)}
            />
          </Field>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <p className="text-[11px] text-slate-500">
            Appears in the assignee&rsquo;s work and this account&rsquo;s delivery list.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Add task
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
