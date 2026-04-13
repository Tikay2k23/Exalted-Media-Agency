"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate, formatDateTime, formatEnumLabel } from "@/lib/utils";

type TrackerTask = {
  id: string;
  title: string;
  note: string | null;
  status: string;
  priority: string;
  category: string;
  estimatedHours: number;
  weekStartDate: Date;
  dueDate: Date;
  assignedToId: string;
  assignedTo: {
    id: string;
    name: string;
    email: string;
    role: string;
    department: string;
    jobTitle: string | null;
  };
  createdBy: {
    id: string;
    name: string;
    role: string;
  } | null;
  client: {
    id: string;
    companyName: string;
    clientName: string;
  } | null;
  eodEntries: Array<{
    id: string;
    taskId: string;
    authorId: string;
    entryDate: Date;
    summary: string;
    blockers: string | null;
    nextSteps: string | null;
    createdAt: Date;
    author: {
      id: string;
      name: string;
      role: string;
    };
  }>;
};

const statusOptions = ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE"];
const briefPreviewThreshold = 260;

function toneForStatus(status: string): "slate" | "sky" | "amber" | "rose" | "emerald" {
  switch (status) {
    case "IN_PROGRESS":
      return "sky";
    case "BLOCKED":
      return "rose";
    case "IN_REVIEW":
      return "amber";
    case "DONE":
      return "emerald";
    default:
      return "slate";
  }
}

function toneForPriority(priority: string): "slate" | "sky" | "amber" | "rose" {
  switch (priority) {
    case "URGENT":
      return "rose";
    case "HIGH":
      return "amber";
    case "MEDIUM":
      return "sky";
    default:
      return "slate";
  }
}

function groupEntriesByDay(task: TrackerTask) {
  const groups = new Map<
    string,
    {
      date: Date;
      entries: TrackerTask["eodEntries"];
    }
  >();

  task.eodEntries.forEach((entry) => {
    const key = new Date(entry.entryDate).toISOString().slice(0, 10);
    const current = groups.get(key);

    if (current) {
      current.entries.push(entry);
      return;
    }

    groups.set(key, {
      date: entry.entryDate,
      entries: [entry],
    });
  });

  return Array.from(groups.values()).sort(
    (left, right) => +new Date(right.date) - +new Date(left.date),
  );
}

export function FulfillmentTable({
  tasks,
  currentUserId,
  canManageAll,
  selectedDate,
  defaultEntryDate,
  autoExpand,
}: {
  tasks: TrackerTask[];
  currentUserId: string;
  canManageAll: boolean;
  selectedDate: string;
  defaultEntryDate: string;
  autoExpand: boolean;
}) {
  const router = useRouter();
  const [statusError, setStatusError] = useState<{
    taskId: string;
    message: string;
  } | null>(null);
  const [eodError, setEodError] = useState<{
    taskId: string;
    message: string;
  } | null>(null);
  const [savingStatusTaskId, setSavingStatusTaskId] = useState<string | null>(null);
  const [savingEodTaskId, setSavingEodTaskId] = useState<string | null>(null);
  const [expandedBriefs, setExpandedBriefs] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  function toggleBrief(taskId: string) {
    setExpandedBriefs((current) => ({
      ...current,
      [taskId]: !current[taskId],
    }));
  }

  function saveStatus(taskId: string, formData: FormData) {
    setStatusError(null);
    setSavingStatusTaskId(taskId);

    startTransition(async () => {
      const response = await fetch(`/api/employee-tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: formData.get("status"),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setStatusError({
          taskId,
          message: data?.error ?? "Unable to update task status.",
        });
        setSavingStatusTaskId(null);
        return;
      }

      setSavingStatusTaskId(null);
      router.refresh();
    });
  }

  function saveEod(taskId: string, formData: FormData) {
    setEodError(null);
    setSavingEodTaskId(taskId);

    startTransition(async () => {
      const response = await fetch(`/api/employee-tasks/${taskId}/eod`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entryDate: formData.get("entryDate"),
          summary: formData.get("summary"),
          blockers: formData.get("blockers"),
          nextSteps: formData.get("nextSteps"),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setEodError({
          taskId,
          message: data?.error ?? "Unable to save the EOD update.",
        });
        setSavingEodTaskId(null);
        return;
      }

      setSavingEodTaskId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {tasks.length ? (
        tasks.map((task) => {
          const canUpdate = canManageAll || currentUserId === task.assignedToId;
          const groupedEntries = groupEntriesByDay(task);
          const briefIsLong = (task.note?.length ?? 0) > briefPreviewThreshold;
          const briefExpanded = Boolean(expandedBriefs[task.id]);
          const editableEntry = task.eodEntries.find(
            (entry) =>
              entry.authorId === currentUserId &&
              new Date(entry.entryDate).toISOString().slice(0, 10) === defaultEntryDate,
          );
          const highlightedDate = selectedDate || defaultEntryDate;
          const statusSaving = isPending && savingStatusTaskId === task.id;
          const eodSaving = isPending && savingEodTaskId === task.id;

          return (
            <details
              key={task.id}
              open={autoExpand}
              className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm"
            >
              <summary className="cursor-pointer list-none px-5 py-5 [&::-webkit-details-marker]:hidden">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-950">{task.title}</h3>
                      <Badge tone={toneForStatus(task.status)}>
                        {formatEnumLabel(task.status)}
                      </Badge>
                      <Badge tone={toneForPriority(task.priority)}>
                        {formatEnumLabel(task.priority)}
                      </Badge>
                      <Badge tone="sky">{formatEnumLabel(task.category)}</Badge>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                      <span>{task.client?.companyName ?? "Internal task"}</span>
                      <span>{task.assignedTo.name}</span>
                      <span>{task.assignedTo.jobTitle ?? formatEnumLabel(task.assignedTo.department)}</span>
                      <span>{task.estimatedHours}h booked</span>
                      <span>Due {formatDate(task.dueDate)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge tone="violet">
                      {task.eodEntries.length} EOD update{task.eodEntries.length === 1 ? "" : "s"}
                    </Badge>
                    <Badge tone="slate">
                      Week of {formatDate(task.weekStartDate)}
                    </Badge>
                  </div>
                </div>
              </summary>

              <div className="space-y-5 border-t border-slate-100 px-5 py-5">
                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      Task Brief
                    </p>
                    <p
                      className={cn(
                        "mt-3 text-sm leading-7 whitespace-pre-wrap text-slate-600",
                        briefIsLong && !briefExpanded ? "line-clamp-4" : "",
                      )}
                    >
                      {task.note ?? "No task brief has been added yet."}
                    </p>
                    {briefIsLong ? (
                      <button
                        type="button"
                        onClick={() => toggleBrief(task.id)}
                        className="mt-3 text-sm font-semibold text-sky-700 transition hover:text-sky-600"
                      >
                        {briefExpanded ? "See less" : "See more"}
                      </button>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500">
                      <span>Assigned by {task.createdBy?.name ?? "System"}</span>
                      <span>{task.assignedTo.email}</span>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Task Status
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          Keep the weekly task current while daily updates stay attached below.
                        </p>
                      </div>
                    </div>

                    <form
                      action={(formData) => saveStatus(task.id, formData)}
                      className="mt-4 flex flex-col gap-3 sm:flex-row"
                    >
                      <Select
                        name="status"
                        defaultValue={task.status}
                        disabled={!canUpdate || statusSaving}
                        className="sm:flex-1"
                      >
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>
                            {formatEnumLabel(option)}
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="submit"
                        variant={canUpdate ? "primary" : "secondary"}
                        disabled={!canUpdate || statusSaving}
                        className="gap-2"
                      >
                        {statusSaving ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save status
                      </Button>
                    </form>
                    {statusError?.taskId === task.id ? (
                      <p className="mt-3 text-sm text-rose-600">
                        {statusError.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Daily EOD Update
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          Add or update the end-of-day note for this task. Entries stay attached to the task for the full weekly audit trail.
                        </p>
                      </div>
                      <Badge tone="sky">{highlightedDate}</Badge>
                    </div>

                    <form
                      action={(formData) => saveEod(task.id, formData)}
                      className="mt-4 space-y-3"
                    >
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-600">Entry date</span>
                        <Input
                          name="entryDate"
                          type="date"
                          defaultValue={defaultEntryDate}
                          disabled={!canUpdate || eodSaving}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-600">Progress update</span>
                        <Textarea
                          name="summary"
                          required
                          defaultValue={editableEntry?.summary ?? ""}
                          placeholder="Summarize what moved forward today, what was shipped, and what changed."
                          disabled={!canUpdate || eodSaving}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-600">Blockers</span>
                        <Textarea
                          name="blockers"
                          defaultValue={editableEntry?.blockers ?? ""}
                          placeholder="Capture anything slowing delivery down."
                          disabled={!canUpdate || eodSaving}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-600">Next steps</span>
                        <Textarea
                          name="nextSteps"
                          defaultValue={editableEntry?.nextSteps ?? ""}
                          placeholder="Outline what happens next so managers can review progress quickly."
                          disabled={!canUpdate || eodSaving}
                        />
                      </label>
                      <Button
                        type="submit"
                        disabled={!canUpdate || eodSaving}
                        className="gap-2"
                      >
                        {eodSaving ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {editableEntry ? "Update EOD" : "Post EOD"}
                      </Button>
                    </form>
                    {eodError?.taskId === task.id ? (
                      <p className="mt-3 text-sm text-rose-600">
                        {eodError.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          Weekly EOD History
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          Every daily update stays pinned to the task for a clean, readable audit trail.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      {groupedEntries.length ? (
                        groupedEntries.map((group) => {
                          const dayKey = new Date(group.date).toISOString().slice(0, 10);
                          const highlighted = dayKey === highlightedDate;

                          return (
                            <div
                              key={dayKey}
                              className={`rounded-2xl border px-4 py-4 ${
                                highlighted
                                  ? "border-sky-200 bg-sky-50"
                                  : "border-white bg-white"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-slate-900">
                                    {formatDate(group.date)}
                                  </p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                                    {group.entries.length} update{group.entries.length === 1 ? "" : "s"}
                                  </p>
                                </div>
                                {highlighted ? <Badge tone="sky">Selected date</Badge> : null}
                              </div>

                              <div className="mt-4 space-y-4">
                                {group.entries.map((entry) => (
                                  <div
                                    key={entry.id}
                                    className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div>
                                        <p className="font-medium text-slate-900">
                                          {entry.author.name}
                                        </p>
                                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                                          {formatEnumLabel(entry.author.role)}
                                        </p>
                                      </div>
                                      <p className="text-xs text-slate-400">
                                        Logged {formatDateTime(entry.createdAt)}
                                      </p>
                                    </div>

                                    <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                                      <div>
                                        <p className="font-medium text-slate-900">Progress</p>
                                        <p>{entry.summary}</p>
                                      </div>
                                      {entry.blockers ? (
                                        <div>
                                          <p className="font-medium text-slate-900">Blockers</p>
                                          <p>{entry.blockers}</p>
                                        </div>
                                      ) : null}
                                      {entry.nextSteps ? (
                                        <div>
                                          <p className="font-medium text-slate-900">Next steps</p>
                                          <p>{entry.nextSteps}</p>
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                          No EOD updates logged for this task in the selected week yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </details>
          );
        })
      ) : (
        <div className="rounded-[1.75rem] border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No weekly tasks match the current filters. Try another week, date, client, or search term.
        </div>
      )}
    </div>
  );
}
