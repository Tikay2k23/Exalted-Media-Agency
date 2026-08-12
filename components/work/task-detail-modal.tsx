"use client";

import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  MessageSquare,
  Paintbrush,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  categoryGuide,
  priorityTone,
  statusLabel,
  statusTone,
} from "@/lib/tasks/task-catalogue";
import { parseTaskAssets, relativeDue } from "@/lib/tasks/task-filters";
import { formatEnumLabel } from "@/lib/utils";

import type { TaskComment, TaskEvent, TaskRow, ViewerCapabilities } from "./task-types";

type ModalTab = "details" | "activity" | "comments" | "files";

const ASSET_ICONS = {
  drive: FileText,
  canva: Paintbrush,
  document: FileText,
  image: ImageIcon,
  website: Link2,
  ghl: Link2,
  other: Link2,
} as const;

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDay(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-xs font-medium text-slate-900">
        {children}
      </dd>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-900">{label}</p>
      <div className="mt-1 text-xs leading-5 text-slate-600">{children}</div>
    </div>
  );
}

/**
 * One task, opened over the page rather than beside it.
 *
 * The tabs are the four questions somebody has about a piece of work: what is
 * it, what has happened to it, what have people said, and where are the files.
 * The actions at the bottom are only the ones this person may actually take -
 * a greyed-out Approve on somebody else's work just invites a click that fails.
 */
export function TaskDetailModal({
  task,
  viewer,
  comments,
  activity,
  loading,
  onClose,
  onAction,
  onComment,
  busy,
  error,
}: {
  task: TaskRow;
  viewer: ViewerCapabilities;
  comments: TaskComment[];
  activity: TaskEvent[];
  loading: boolean;
  onClose: () => void;
  onAction: (body: Record<string, unknown>) => void;
  onComment: (body: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [tab, setTab] = useState<ModalTab>("details");
  const [draft, setDraft] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [showRevisionBox, setShowRevisionBox] = useState(false);
  const [hours, setHours] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /*
   * Escape closes it, and the page behind stops scrolling while it is open.
   * Both are what people expect of a modal, and both are cheap to get wrong by
   * leaving out.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previous = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const guide = categoryGuide(task.category as never);
  const assets = parseTaskAssets(task.requiredAssets, task.evidenceUrl);
  const due = relativeDue(task.dueDate, new Date());

  const isAssignee = task.assignedTo?.id === viewer.id;
  const isFinished = task.status === "APPROVED" || task.status === "DONE";
  const isArchived = Boolean(task.archivedAt);

  // Naming a reviewer is what makes review compulsory. Without one, finishing
  // your own task is just finishing it.
  const needsApproval = task.requiresApproval;
  const canReview =
    !isAssignee && (task.reviewer?.id === viewer.id || viewer.canReviewAny);

  const canSubmit =
    !isArchived
    && !isFinished
    && task.status !== "NEEDS_REVIEW"
    && (isAssignee || viewer.canEdit);

  const tabs: { value: ModalTab; label: string; count?: number }[] = [
    { value: "details", label: "Details" },
    { value: "activity", label: "Activity" },
    { value: "comments", label: "Comments", count: comments.length },
    { value: "files", label: "Files", count: assets.length },
  ];

  /*
   * Rendered into the body rather than where it sits in the tree.
   *
   * Card carries backdrop-blur, and an element with backdrop-filter becomes the
   * containing block for any fixed-position descendant - which is what clipped
   * the Add Client dialog to the size of its parent. A portal puts this above
   * all of that, so the modal is measured against the viewport wherever it is
   * opened from.
   */
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Task details"
    >
      {/* The scrim. Clicking it is the fastest way out of a modal. */}
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-slate-950/40"
        onClick={onClose}
        aria-label="Close task details"
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        className="relative flex max-h-full w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[min(46rem,90vh)] sm:max-w-2xl sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-6 text-slate-950">{task.title}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={statusTone(task.status)}>{statusLabel(task.status)}</Badge>
              <Badge tone={priorityTone(task.priority)}>{formatEnumLabel(task.priority)}</Badge>
              <Badge tone="slate">{guide?.label ?? formatEnumLabel(task.category)}</Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-100 px-3">
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={`-mb-px border-b-2 px-2.5 py-2.5 text-xs font-semibold transition ${
                tab === item.value
                  ? "border-sky-500 text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {item.label}
              {item.count !== undefined ? ` (${item.count})` : ""}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "details" ? (
            <div className="space-y-4">
              {task.revisionNote && task.status === "REVISION_REQUIRED" ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-xs font-semibold text-rose-800">Changes requested</p>
                  <p className="mt-1 text-xs leading-5 text-rose-700">{task.revisionNote}</p>
                </div>
              ) : null}

              {isFinished ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Task completed
                  </p>
                  <dl className="mt-2 space-y-0.5">
                    <div className="flex justify-between gap-3 text-xs text-emerald-800">
                      <span>Completed by</span>
                      <span className="font-medium">{task.assignedTo?.name ?? "—"}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-xs text-emerald-800">
                      <span>Completion date</span>
                      <span className="font-medium">{formatDay(task.completedAt)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-xs text-emerald-800">
                      <span>Approved by</span>
                      <span className="font-medium">
                        {task.approvedBy?.name ?? "Not reviewed"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3 text-xs text-emerald-800">
                      <span>Approval date</span>
                      <span className="font-medium">{formatDay(task.approvedAt)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-xs text-emerald-800">
                      <span>Estimated vs actual</span>
                      <span className="font-medium">
                        {task.estimatedHours}h vs {task.actualHours ?? "—"}
                        {task.actualHours === null ? "" : "h"}
                      </span>
                    </div>
                  </dl>
                </div>
              ) : null}

              <dl className="grid gap-x-8 sm:grid-cols-2">
                <div className="divide-y divide-slate-100">
                  <Pair label="Client">
                    {task.client ? (
                      <Link
                        href={`/clients/${task.client.id}`}
                        className="text-sky-700 underline underline-offset-2"
                      >
                        {task.client.companyName}
                      </Link>
                    ) : (
                      "Internal task"
                    )}
                  </Pair>
                  <Pair label="Campaign / Project">{task.project?.name ?? "—"}</Pair>
                  <Pair label="Assigned To">{task.assignedTo?.name ?? "—"}</Pair>
                  <Pair label="Assigned By">{task.createdBy?.name ?? "—"}</Pair>
                  <Pair label="Reviewer / Approver">{task.reviewer?.name ?? "None"}</Pair>
                  <Pair label="Platform / Channel">
                    {task.platform ? formatEnumLabel(task.platform) : "—"}
                  </Pair>
                </div>
                <div className="divide-y divide-slate-100">
                  <Pair label="Due Date">
                    <span className={due.tone === "overdue" ? "text-rose-600" : undefined}>
                      {formatDay(task.dueDate)} ({due.label})
                    </span>
                  </Pair>
                  <Pair label="Start Date">{formatDay(task.startDate)}</Pair>
                  <Pair label="Est. Hours">{task.estimatedHours}h</Pair>
                  <Pair label="Actual Hours">
                    {task.actualHours === null ? "Not recorded" : `${task.actualHours}h`}
                  </Pair>
                  <Pair label="Priority">{formatEnumLabel(task.priority)}</Pair>
                  <Pair label="Recurring">
                    {task.recurrence === "NONE" ? "None" : formatEnumLabel(task.recurrence)}
                  </Pair>
                </div>
              </dl>

              <div className="space-y-3 border-t border-slate-100 pt-3">
                {task.objective ? <Block label="Objective">{task.objective}</Block> : null}
                {task.completionCriteria ? (
                  <Block label="Deliverable / Outcome">{task.completionCriteria}</Block>
                ) : null}
                {task.note ? (
                  <Block label="Description / Instructions">
                    <span className="whitespace-pre-wrap">{task.note}</span>
                  </Block>
                ) : null}
                {task.kpi ? <Block label="KPI / Success Metric">{task.kpi}</Block> : null}
                {task.blocker ? (
                  <Block label="Dependency / Blocker">{task.blocker}</Block>
                ) : null}
                {assets.length ? (
                  <Block label="Required Assets">
                    <ul className="space-y-1">
                      {assets.map((asset) => (
                        <li key={asset.label + (asset.url ?? "")}>
                          {asset.url ? (
                            <a
                              href={asset.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sky-700 underline underline-offset-2"
                            >
                              {asset.label}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            asset.label
                          )}
                        </li>
                      ))}
                    </ul>
                  </Block>
                ) : null}
              </div>
            </div>
          ) : null}

          {tab === "activity" ? (
            loading ? (
              <p className="text-xs text-slate-500">Loading the trail…</p>
            ) : activity.length === 0 ? (
              <p className="text-xs text-slate-500">Nothing recorded against this task yet.</p>
            ) : (
              <ol className="space-y-3">
                {activity.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    <div className="min-w-0">
                      <p className="text-xs leading-5 text-slate-800">{event.action}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {event.actor?.name ?? "System"} · {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )
          ) : null}

          {tab === "comments" ? (
            <div className="space-y-3">
              {loading ? (
                <p className="text-xs text-slate-500">Loading the thread…</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nothing said yet. Questions about this task belong here, not in a chat
                  somebody has to remember to search.
                </p>
              ) : (
                comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`rounded-xl border p-3 ${
                      comment.isRevisionNote
                        ? "border-rose-200 bg-rose-50"
                        : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900">
                        {comment.author.name}
                        <span className="ml-1.5 font-normal text-slate-500">
                          {comment.author.teamRole
                            ? formatEnumLabel(comment.author.teamRole)
                            : ""}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatDateTime(comment.createdAt)}
                      </p>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                      {comment.body}
                    </p>
                  </div>
                ))
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!draft.trim()) return;
                  onComment(draft.trim());
                  setDraft("");
                }}
                className="space-y-2"
              >
                <Textarea
                  rows={3}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask a question, or say what changed."
                />
                <Button type="submit" size="sm" disabled={busy || !draft.trim()}>
                  {busy ? (
                    <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Add comment
                </Button>
              </form>
            </div>
          ) : null}

          {tab === "files" ? (
            assets.length === 0 ? (
              <p className="text-xs text-slate-500">
                No assets linked. Add them to the task so whoever picks it up is not
                hunting through Drive.
              </p>
            ) : (
              <ul className="space-y-2">
                {assets.map((asset) => {
                  const Icon = ASSET_ICONS[asset.kind];
                  return (
                    <li key={asset.label + (asset.url ?? "")}>
                      {asset.url ? (
                        <a
                          href={asset.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-2.5 transition hover:border-sky-300 hover:bg-sky-50/50"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">
                            {asset.label}
                          </span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </a>
                      ) : (
                        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 p-2.5">
                          <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="min-w-0 flex-1 text-xs text-slate-700">
                            {asset.label}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
        </div>

        {/* Actions */}
        <div className="space-y-2 border-t border-slate-100 bg-slate-50/70 p-3">
          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          ) : null}

          {isArchived ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">
                Archived {formatDay(task.archivedAt)}. It stays in the reports.
              </p>
              <div className="flex flex-wrap gap-2">
                {viewer.canArchive ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onAction({ action: "archive", archived: false })}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Restore
                  </Button>
                ) : null}
                {viewer.canDelete ? (
                  confirmDelete ? (
                    <div className="w-full rounded-xl border border-rose-200 bg-white p-3">
                      <p className="text-xs font-semibold text-slate-900">
                        Permanently delete this task?
                      </p>
                      <p className="mt-1 text-xs text-slate-600">This action cannot be undone.</p>
                      <div className="mt-2.5 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setConfirmDelete(false)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={() => onAction({ action: "delete" })}
                        >
                          Delete Permanently
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete permanently
                    </Button>
                  )
                ) : null}
              </div>
            </div>
          ) : task.status === "NEEDS_REVIEW" ? (
            canReview ? (
              <div className="space-y-2">
                {showRevisionBox ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      placeholder="What needs changing? Be specific — this is what they work from."
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setShowRevisionBox(false)}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy || !reviewNote.trim()}
                        onClick={() =>
                          onAction({
                            action: "review",
                            decision: "REQUEST_REVISION",
                            note: reviewNote.trim(),
                          })
                        }
                      >
                        Send back
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        onAction({
                          action: "review",
                          decision: "APPROVE",
                          note: reviewNote.trim() || null,
                        })
                      }
                    >
                      {busy ? (
                        <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setShowRevisionBox(true)}
                    >
                      Request revision
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                {isAssignee
                  ? "Waiting on review. You did this work, so somebody else signs it off."
                  : `Waiting on ${task.reviewer?.name ?? "a reviewer"}.`}
              </p>
            )
          ) : isFinished ? (
            viewer.canArchive ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => onAction({ action: "archive", archived: true })}
              >
                Archive task
              </Button>
            ) : (
              <p className="text-xs text-slate-600">Finished. Nothing more to do here.</p>
            )
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="h-9 w-auto min-w-[10rem] flex-1 text-xs"
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value)}
                  aria-label="Change status"
                >
                  <option value="">Update status…</option>
                  <option value="TODO">To do</option>
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="WAITING_CLIENT">Waiting on client</option>
                  <option value="BLOCKED">Blocked</option>
                  <option value="BACKLOG">Backlog</option>
                  {needsApproval ? null : <option value="DONE">Done</option>}
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || !nextStatus}
                  onClick={() => {
                    onAction({ action: "status", status: nextStatus });
                    setNextStatus("");
                  }}
                >
                  Update
                </Button>
              </div>

              {canSubmit ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    className="h-9 w-24 text-xs"
                    placeholder="Hours"
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                    aria-label="Actual hours spent"
                  />
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={busy}
                    onClick={() =>
                      onAction({
                        action: "submit",
                        actualHours: hours === "" ? null : Number(hours),
                      })
                    }
                  >
                    {busy ? (
                      <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Submit for review
                  </Button>
                </div>
              ) : null}

              <p className="flex items-start gap-1.5 text-[11px] leading-4 text-slate-500">
                <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                {needsApproval
                  ? `${task.reviewer?.name ?? "A reviewer"} signs this off. Record your hours when you submit.`
                  : "No reviewer on this task, so you can close it yourself when it is done."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
