"use client";

import { CheckCircle2, ExternalLink, LoaderCircle, NotebookPen } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { statusLabel, statusTone } from "@/lib/tasks/task-catalogue";
import { Badge } from "@/components/ui/badge";

export interface EodEntry {
  id: string;
  entryDate: string;
  summary: string;
  nextSteps: string | null;
  blockers: string | null;
  progressPercent: number | null;
  hoursSpent: number | null;
  workLink: string | null;
  taskStatus: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string };
}

const PROGRESS_STEPS = [0, 25, 50, 75, 100];

/** Statuses somebody can report themselves into. Finishing goes through review. */
const REPORTABLE_STATUSES = [
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CLIENT", label: "Waiting on client" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "NEEDS_REVIEW", label: "Needs review" },
];

function dayLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-[11px] leading-4 text-slate-500">{hint}</span> : null}
    </label>
  );
}

/**
 * The daily entry, and everything written before it.
 *
 * The form only appears for the person doing the work. A manager reading
 * somebody else's task gets the history and nothing to type into - the whole
 * value of a daily entry is that it is first-hand, and a box a manager can fill
 * in on your behalf destroys that quietly.
 */
export function EodPanel({
  taskId,
  taskStatus,
  isAssignee,
  entries,
  loading,
  onSaved,
}: {
  taskId: string;
  taskStatus: string;
  isAssignee: boolean;
  entries: EodEntry[];
  loading: boolean;
  onSaved: () => void;
}) {
  const today = new Date();
  const todayKey = today.toDateString();

  const todays = entries.find(
    (entry) => new Date(entry.entryDate).toDateString() === todayKey,
  );

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState(todays?.summary ?? "");
  const [nextSteps, setNextSteps] = useState(todays?.nextSteps ?? "");
  const [blockers, setBlockers] = useState(todays?.blockers ?? "");
  const [progress, setProgress] = useState(String(todays?.progressPercent ?? 50));
  const [hours, setHours] = useState(todays?.hoursSpent ? String(todays.hoursSpent) : "");
  const [workLink, setWorkLink] = useState(todays?.workLink ?? "");
  const [status, setStatus] = useState(todays?.taskStatus ?? taskStatus);

  async function save() {
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/employee-tasks/${taskId}/eod`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary,
        nextSteps,
        blockers: blockers.trim() || null,
        progressPercent: Number(progress),
        hoursSpent: hours === "" ? null : Number(hours),
        workLink: workLink.trim() || null,
        taskStatus: status,
      }),
    });

    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    setBusy(false);

    if (!response.ok) {
      setError(data?.error ?? "That entry didn't save.");
      return;
    }

    setOpen(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      {isAssignee ? (
        open ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-slate-950">Daily EOD</p>
              <p className="text-[11px] text-slate-500">{dayLabel(today.toISOString())}</p>
            </div>

            <Field
              label="Today's progress"
              required
              hint="What did you complete or move forward today?"
            >
              <Textarea
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Current progress">
                <Select
                  className="h-9 text-xs"
                  value={progress}
                  onChange={(event) => setProgress(event.target.value)}
                >
                  {PROGRESS_STEPS.map((step) => (
                    <option key={step} value={step}>
                      {step}%
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Time spent today">
                <Input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  className="h-9 text-xs"
                  placeholder="2.5"
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                />
              </Field>
              <Field label="Task status">
                <Select
                  className="h-9 text-xs"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  {REPORTABLE_STATUSES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="Blockers / issues"
              required={status === "BLOCKED"}
              hint="Is anything preventing you from continuing?"
            >
              <Textarea
                rows={2}
                value={blockers}
                onChange={(event) => setBlockers(event.target.value)}
              />
            </Field>

            <Field label="Next step" required hint="What will you work on next?">
              <Textarea
                rows={2}
                value={nextSteps}
                onChange={(event) => setNextSteps(event.target.value)}
              />
            </Field>

            <Field label="Work / proof link" hint="A page, doc, Loom or board. Never a password.">
              <Input
                className="h-9 text-xs"
                placeholder="https://"
                value={workLink}
                onChange={(event) => setWorkLink(event.target.value)}
              />
            </Field>

            {error ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            ) : null}

            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={busy || !summary.trim() || !nextSteps.trim()}
              >
                {busy ? (
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <NotebookPen className="mr-1.5 h-3.5 w-3.5" />
                )}
                {todays ? "Update EOD" : "Submit EOD"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">
                {todays ? "Today's EOD is in" : "No EOD for today yet"}
              </p>
              <p className="text-[11px] text-slate-500">
                {todays
                  ? `Filed ${timeLabel(todays.updatedAt)}${
                      todays.createdAt !== todays.updatedAt ? " · revised" : ""
                    }`
                  : "One entry per task, per day."}
              </p>
            </div>
            <Button size="sm" onClick={() => setOpen(true)}>
              {todays ? (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  Update Today&rsquo;s EOD
                </>
              ) : (
                <>
                  <NotebookPen className="mr-1.5 h-3.5 w-3.5" />
                  Submit Today&rsquo;s EOD
                </>
              )}
            </Button>
          </div>
        )
      ) : null}

      {/* Progress trail. Only worth drawing once there is a direction to see. */}
      {entries.filter((entry) => entry.progressPercent !== null).length > 1 ? (
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-900">Progress</p>
          <ul className="mt-2 space-y-1.5">
            {entries
              .filter((entry) => entry.progressPercent !== null)
              .map((entry) => (
                <li key={`trail-${entry.id}`} className="flex items-center gap-2.5">
                  <span className="w-20 shrink-0 text-[11px] text-slate-500">
                    {new Date(entry.entryDate).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-sky-500"
                      style={{ width: `${entry.progressPercent}%` }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right text-[11px] font-medium text-slate-700">
                    {entry.progressPercent}%
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {/* History */}
      {loading ? (
        <p className="text-xs text-slate-500">Loading the history…</p>
      ) : entries.length === 0 ? (
        <p className="text-xs leading-5 text-slate-500">
          No end-of-day entries on this task yet.
        </p>
      ) : (
        <ol className="space-y-3">
          {[...entries].reverse().map((entry) => (
            <li key={entry.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900">
                  {dayLabel(entry.entryDate)}
                </p>
                <div className="flex items-center gap-1.5">
                  {entry.progressPercent !== null ? (
                    <Badge tone="sky">{entry.progressPercent}%</Badge>
                  ) : null}
                  {entry.hoursSpent ? <Badge tone="slate">{entry.hoursSpent}h</Badge> : null}
                  {entry.taskStatus ? (
                    <Badge tone={statusTone(entry.taskStatus)}>
                      {statusLabel(entry.taskStatus as never)}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                {entry.summary}
              </p>

              {entry.blockers ? (
                <p className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs leading-5 text-rose-700">
                  <span className="font-semibold">Blocker: </span>
                  {entry.blockers}
                </p>
              ) : null}

              {entry.nextSteps ? (
                <p className="mt-1.5 text-xs leading-5 text-slate-600">
                  <span className="font-semibold text-slate-800">Next: </span>
                  {entry.nextSteps}
                </p>
              ) : null}

              {entry.workLink ? (
                <a
                  href={entry.workLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-sky-700 underline underline-offset-2"
                >
                  View the work
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}

              <p className="mt-2 text-[11px] text-slate-400">
                {entry.author.name} · {timeLabel(entry.updatedAt)}
                {entry.createdAt !== entry.updatedAt ? " · revised" : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
