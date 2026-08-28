"use client";

/**
 * The optimization workspace.
 *
 * "View optimizations" used to be an anchor: it scrolled the page to the log,
 * and when a client had none it scrolled to an empty box, which is the least
 * useful thing a button can do. This is what it opens instead - the client's
 * actual initiatives, filtered, with the record itself one click away.
 *
 * It is a reader and a mover, not a second optimization system. Every write
 * goes to the routes that already existed, the state of a record is derived
 * from the columns it already had, and the only buttons shown are the moves
 * that record's state allows.
 */

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Modal } from "@/components/journey/client/journey-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  OPTIMIZATION_OUTCOMES,
  OPTIMIZATION_STATE_LABELS,
  type OptimizationDetail,
  type OptimizationState,
  isOverdueForReview,
  optimizationActions,
  optimizationName,
  optimizationState,
  sortOptimizations,
} from "@/lib/success/optimization-status";
import { cn, formatEnumLabel } from "@/lib/utils";

export interface OptimizationWorkspaceProps {
  clientId: string;
  companyName: string;
  rows: OptimizationDetail[];
  canManage: boolean;
  /** The signed-in person, so "mine to move" can be answered without a call. */
  actorId: string;
  /** True for the seats that may move anybody's, not only their own. */
  canManageAll: boolean;
  onLog: () => void;
  onEdit: (row: OptimizationDetail) => void;
  onClose: () => void;
}

type Filter = "OPEN" | "ALL" | OptimizationState;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "ALL", label: "All" },
  { value: "PLANNED", label: "Planned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "MONITORING", label: "Monitoring" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STATE_TONE: Record<OptimizationState, "slate" | "sky" | "amber" | "emerald" | "rose"> = {
  PLANNED: "slate",
  IN_PROGRESS: "sky",
  MONITORING: "amber",
  COMPLETED: "emerald",
  CANCELLED: "slate",
};

const PRIORITY_TONE: Record<string, "slate" | "sky" | "amber" | "rose"> = {
  LOW: "slate",
  MEDIUM: "sky",
  HIGH: "amber",
  CRITICAL: "rose",
};

function useMutation(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** `busy` is the double-click guard: a jammed button posts once. */
  async function send(url: string, body: unknown) {
    if (busy) return false;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        /*
         * The server's words. It knows which rule refused - somebody else
         * concluded it first, the seat is wrong, the reading is missing - and
         * a generic message would throw all of that away.
         */
        setError(data.error ?? "That did not work. Nothing was changed.");
        return false;
      }

      onDone();
      return true;
    } catch {
      setError("Could not reach the server. Nothing was changed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, setError, send };
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] leading-4 text-rose-700">
      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

function shortDate(value: string | null): string | null {
  if (!value) return null;

  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/* -------------------------------------------------------------------------- */
/* The workspace                                                              */
/* -------------------------------------------------------------------------- */

export function OptimizationWorkspace(props: OptimizationWorkspaceProps) {
  const { rows, canManage, onLog, onClose } = props;
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  const [filter, setFilter] = useState<Filter>("OPEN");
  const [owner, setOwner] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(() => sortOptimizations(rows, now), [rows, now]);

  const counts = useMemo(() => {
    const map = new Map<Filter, number>();

    map.set("ALL", sorted.length);

    for (const row of sorted) {
      const state = optimizationState(row, now);

      map.set(state, (map.get(state) ?? 0) + 1);

      if (state === "PLANNED" || state === "IN_PROGRESS" || state === "MONITORING") {
        map.set("OPEN", (map.get("OPEN") ?? 0) + 1);
      }
    }

    return map;
  }, [sorted, now]);

  const shown = sorted.filter((row) => {
    const state = optimizationState(row, now);

    if (filter === "OPEN" && state !== "PLANNED" && state !== "IN_PROGRESS" && state !== "MONITORING") {
      return false;
    }

    if (filter !== "OPEN" && filter !== "ALL" && state !== filter) return false;
    if (owner !== "all" && row.ownerId !== owner) return false;
    if (priority !== "all" && row.priority !== priority) return false;

    return true;
  });

  const owners = useMemo(() => {
    const seen = new Map<string, string>();

    for (const row of rows) {
      if (row.ownerId && row.ownerName) seen.set(row.ownerId, row.ownerName);
    }

    return [...seen.entries()];
  }, [rows]);

  const openRow = openId ? rows.find((row) => row.id === openId) ?? null : null;

  if (openRow) {
    return (
      <OptimizationRecord
        {...props}
        row={openRow}
        now={now}
        onBack={() => setOpenId(null)}
        onChanged={() => {
          router.refresh();
          setOpenId(null);
        }}
      />
    );
  }

  return (
    <Modal
      eyebrow={props.companyName}
      title="Optimizations"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">
            {shown.length} of {rows.length} shown
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      {/*
        * Nothing at all. Not the same as "nothing matches this filter", and
        * the difference is the whole point of the empty state: one of them
        * needs a first record, the other needs a different filter.
        */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
          <Wrench className="mx-auto h-5 w-5 text-slate-300" aria-hidden />
          <p className="mt-2 text-sm font-semibold text-slate-900">No active optimizations</p>
          <p className="mx-auto mt-1 max-w-sm text-[11px] leading-4 text-slate-500">
            There are currently no optimization initiatives running for this client. An
            optimization records what you changed, why, and whether it worked.
          </p>
          {canManage ? (
            <Button type="button" size="sm" className="mt-3 gap-1.5" onClick={onLog}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Log optimization
            </Button>
          ) : (
            <p className="mt-3 text-[11px] text-slate-400">
              Your seat can read optimizations but not record them.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((option) => {
              const count = counts.get(option.value) ?? 0;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    filter === option.value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {option.label} ({count})
                </button>
              );
            })}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Select value={owner} onChange={(event) => setOwner(event.target.value)}>
              <option value="all">Any owner</option>
              {owners.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
            <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="all">Any priority</option>
              {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((value) => (
                <option key={value} value={value}>
                  {formatEnumLabel(value)}
                </option>
              ))}
            </Select>
          </div>

          {canManage ? (
            <div className="mt-2 flex justify-end">
              <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={onLog}>
                <Plus className="h-3 w-3" aria-hidden />
                Log optimization
              </Button>
            </div>
          ) : null}

          <div className="mt-3 space-y-2">
            {shown.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                Nothing matches this filter.
              </p>
            ) : (
              shown.map((row) => {
                const state = optimizationState(row, now);
                const overdue = isOverdueForReview(row, now);

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setOpenId(row.id)}
                    className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-xs font-semibold text-slate-900">
                        {optimizationName(row)}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge tone={PRIORITY_TONE[row.priority] ?? "slate"}>
                          {formatEnumLabel(row.priority)}
                        </Badge>
                        <Badge tone={STATE_TONE[state]}>{OPTIMIZATION_STATE_LABELS[state]}</Badge>
                      </div>
                    </div>

                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-600">
                      {row.observedProblem}
                    </p>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                      <span>{row.platform}</span>
                      {row.serviceType ? <span>{formatEnumLabel(row.serviceType)}</span> : null}
                      <span>{row.ownerName ?? "Unassigned"}</span>
                      {row.expectedMetric ? <span>{row.expectedMetric}</span> : null}
                      {row.task ? <span>Task linked</span> : null}
                      {overdue ? (
                        <span className="font-semibold text-rose-600">
                          Review was due {shortDate(row.endDate)}
                        </span>
                      ) : row.endDate ? (
                        <span>Review {shortDate(row.endDate)}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* One record                                                                 */
/* -------------------------------------------------------------------------- */

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-[11px] leading-4 text-slate-700">{value}</dd>
    </div>
  );
}

function OptimizationRecord({
  row,
  now,
  companyName,
  actorId,
  canManageAll,
  canManage,
  onBack,
  onChanged,
  onClose,
  onEdit,
}: OptimizationWorkspaceProps & {
  row: OptimizationDetail;
  now: Date;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { busy, error, send } = useMutation(onChanged);
  const [panel, setPanel] = useState<"complete" | "cancel" | "note" | null>(null);

  const state = optimizationState(row, now);
  const allowed = optimizationActions(state);

  /*
   * Mine to move, or a seat that may move anybody's. The server decides the
   * same way; this only keeps buttons off the screen that it would refuse.
   */
  const mayMove = canManage && (canManageAll || row.ownerId === actorId);

  const url = `/api/optimizations/${row.id}`;

  return (
    <Modal
      eyebrow={companyName}
      title={optimizationName(row)}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={onBack}>
            <ArrowLeft className="h-3 w-3" aria-hidden />
            All optimizations
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={STATE_TONE[state]}>{OPTIMIZATION_STATE_LABELS[state]}</Badge>
        <Badge tone={PRIORITY_TONE[row.priority] ?? "slate"}>
          {formatEnumLabel(row.priority)} priority
        </Badge>
        {row.serviceType ? <Badge tone="slate">{formatEnumLabel(row.serviceType)}</Badge> : null}
        {isOverdueForReview(row, now) ? <Badge tone="rose">Review overdue</Badge> : null}
      </div>

      <dl className="mt-3 space-y-2">
        <Row label="Platform" value={row.platform} />
        <Row label="Reason / problem" value={row.observedProblem} />
        <Row label="What changed" value={row.proposedChange} />
        <Row label="Expected result" value={row.hypothesis} />
        <Row label="Metric watched" value={row.expectedMetric} />
        <Row label="Evidence" value={row.evidence} />

        <div className="grid grid-cols-2 gap-2">
          <Row label="Owner" value={row.ownerName ?? "Unassigned"} />
          <Row label="Raised by" value={row.createdByName} />
          <Row label="Started" value={shortDate(row.startDate) ?? "Not started"} />
          <Row label="Review due" value={shortDate(row.endDate) ?? "No date set"} />
        </div>

        {row.task ? (
          <div className="rounded-lg border border-slate-200 p-2.5">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Related task</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-800">{row.task.title}</p>
            <p className="text-[10px] text-slate-500">
              {formatEnumLabel(row.task.status)} - due{" "}
              {new Date(row.task.dueDate).toLocaleDateString()}
            </p>
            <a
              href={`/work?task=${row.task.id}`}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-800"
            >
              Open related task
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </div>
        ) : null}

        {state === "COMPLETED" ? (
          <div className="rounded-lg bg-emerald-50 p-2.5">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-emerald-900">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {formatEnumLabel(row.decision)}
              {row.completedByName ? ` - ${row.completedByName}` : ""}
            </p>
            <Row label="What happened" value={row.result} />
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Row label="Metric before" value={row.metricBefore ?? row.previousSetting} />
              <Row label="Metric after" value={row.metricAfter ?? row.newSetting} />
            </div>
          </div>
        ) : null}

        {state === "CANCELLED" ? (
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="text-[11px] font-semibold text-slate-700">
              Cancelled {shortDate(row.cancelledAt)}
              {row.cancelledByName ? ` by ${row.cancelledByName}` : ""}
            </p>
            <Row label="Reason" value={row.cancelledReason} />
          </div>
        ) : null}

        {row.notes ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-400">Progress notes</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-[11px] leading-4 text-slate-600">
              {row.notes}
            </dd>
          </div>
        ) : null}
      </dl>

      <ErrorLine message={error} />

      {/*
        * Only the moves this state allows, and only for somebody the server
        * would let through. Everything else is absent rather than disabled -
        * a greyed row of buttons is a menu of things that will not happen.
        */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {mayMove && allowed.start ? (
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 px-2.5 text-[11px]"
            disabled={busy}
            onClick={() => void send(url, { action: "start" })}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
            Start optimization
          </Button>
        ) : null}

        {mayMove && allowed.monitor ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 text-[11px]"
            disabled={busy}
            onClick={() => void send(url, { action: "monitor" })}
          >
            Move to monitoring
          </Button>
        ) : null}

        {mayMove && allowed.complete ? (
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => setPanel(panel === "complete" ? null : "complete")}
          >
            Complete optimization
          </Button>
        ) : null}

        {mayMove && allowed.edit ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => onEdit(row)}
          >
            Edit
          </Button>
        ) : null}

        {canManage && allowed.note ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => setPanel(panel === "note" ? null : "note")}
          >
            Add note
          </Button>
        ) : null}

        {mayMove && allowed.cancel ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => setPanel(panel === "cancel" ? null : "cancel")}
          >
            Cancel
          </Button>
        ) : null}
      </div>

      {panel === "complete" ? (
        <form
          className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3"
          action={(formData) =>
            void send(url, {
              action: "complete",
              outcome: String(formData.get("outcome") ?? ""),
              result: String(formData.get("result") ?? ""),
              metricBefore: String(formData.get("metricBefore") ?? ""),
              metricAfter: String(formData.get("metricAfter") ?? ""),
              notes: String(formData.get("notes") ?? ""),
            })
          }
        >
          <p className="text-[11px] leading-4 text-slate-500">
            An optimization exists to answer whether the change worked, so the reading either
            side of it is required rather than optional.
          </p>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Outcome</span>
            <Select name="outcome" defaultValue="MET">
              {OPTIMIZATION_OUTCOMES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Metric before
              </span>
              <Input name="metricBefore" required defaultValue={row.metricBefore ?? ""} placeholder="4.8%" />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                Metric after
              </span>
              <Input name="metricAfter" required placeholder="5.3%" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              What actually happened
            </span>
            <Textarea name="result" rows={2} required />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Lessons learned (optional)
            </span>
            <Textarea name="notes" rows={2} />
          </label>
          <Button type="submit" size="sm" disabled={busy} className="h-7 gap-1 px-2.5 text-[11px]">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
            {busy ? "Saving..." : "Record the result"}
          </Button>
        </form>
      ) : null}

      {panel === "cancel" ? (
        <form
          className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3"
          action={(formData) =>
            void send(url, { action: "cancel", reason: String(formData.get("reason") ?? "") })
          }
        >
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              Why is it being called off?
            </span>
            <Textarea name="reason" rows={2} required />
          </label>
          <Button type="submit" size="sm" disabled={busy} className="h-7 px-2.5 text-[11px]">
            Cancel optimization
          </Button>
        </form>
      ) : null}

      {panel === "note" ? (
        <form
          className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3"
          action={(formData) =>
            void send(url, { action: "note", note: String(formData.get("note") ?? "") })
          }
        >
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Progress note</span>
            <Textarea name="note" rows={2} required />
          </label>
          <Button type="submit" size="sm" disabled={busy} className="h-7 px-2.5 text-[11px]">
            Add note
          </Button>
        </form>
      ) : null}
    </Modal>
  );
}
