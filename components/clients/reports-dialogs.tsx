"use client";

/**
 * The working surfaces behind the Reports & Health cards.
 *
 * Each posts to a route that already existed and already carried the
 * permission check, the validation and the audit entry - saveReport, the
 * report review workflow, saveOptimization. Nothing here decides whether an
 * action is allowed; the server does, and these show what it says when it
 * refuses.
 */

import { AlertTriangle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Modal } from "@/components/journey/client/journey-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  OPTIMIZATION_PRIORITIES,
  type OptimizationDetail,
} from "@/lib/success/optimization-status";
import type { OptimizationRow, ReportRow } from "@/lib/success/reports-health";
import { cn, formatEnumLabel } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Shared plumbing                                                            */
/* -------------------------------------------------------------------------- */

function useMutation(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** `busy` guards the second click, so a jammed button posts once. */
  async function send(url: string, body: unknown) {
    if (busy) return false;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // The server's own words: it knows which rule refused.
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

  return { busy, error, send };
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

/** yyyy-mm-dd, which is what a date input wants. */
function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Prepare report                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The next reporting period, opened as a draft.
 *
 * Defaults to the month just finished, which is the period somebody preparing
 * a monthly report almost always wants, and warns rather than blocks when a
 * report already covers it - the endpoint allows a second one, and there are
 * legitimate reasons to write one.
 */
export function PrepareReportDialog({
  clientId,
  reportTypes,
  existing,
  onClose,
}: {
  clientId: string;
  reportTypes: { value: string; label: string }[];
  existing: ReportRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { busy, error, send } = useMutation(() => {
    router.refresh();
    onClose();
  });

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const due = new Date(now.getFullYear(), now.getMonth(), 5);

  const [start, setStart] = useState(isoDate(periodStart));
  const [end, setEnd] = useState(isoDate(periodEnd));

  /* A report already covering the chosen period is worth saying out loud. */
  const overlapping = existing.filter(
    (report) =>
      Date.parse(report.periodStart) <= Date.parse(end)
      && Date.parse(report.periodEnd) >= Date.parse(start),
  );

  return (
    <Modal
      eyebrow="Reporting"
      title="Prepare report"
      onClose={onClose}
      footer={
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <form
        className="space-y-3"
        action={(formData) =>
          void send(`/api/clients/${clientId}/reports`, {
            type: String(formData.get("type") ?? ""),
            periodStart: start,
            periodEnd: end,
            dueAt: String(formData.get("dueAt") ?? ""),
            dataSources: String(formData.get("dataSources") ?? ""),
            knownLimitations: String(formData.get("knownLimitations") ?? ""),
            recommendedActions: String(formData.get("recommendedActions") ?? ""),
            documentUrl: String(formData.get("documentUrl") ?? ""),
            dataValidated: formData.get("dataValidated") === "on",
          })
        }
      >
        <Field label="Report type">
          <Select name="type" defaultValue="MONTHLY_REPORT">
            {reportTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Period start">
            <Input
              type="date"
              name="periodStart"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              required
            />
          </Field>
          <Field label="Period end">
            <Input
              type="date"
              name="periodEnd"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              required
            />
          </Field>
        </div>

        {overlapping.length > 0 ? (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
            {overlapping.length === 1 ? "A report" : `${overlapping.length} reports`} already
            cover this period ({overlapping.map((r) => formatEnumLabel(r.status)).join(", ")}).
            Creating another is allowed but rarely what you want.
          </p>
        ) : null}

        <Field label="Due date" hint="What the client was promised.">
          <Input type="date" name="dueAt" defaultValue={isoDate(due)} />
        </Field>

        <Field
          label="Data sources"
          hint="Where the numbers came from. Recorded so the report can be defended later."
        >
          <Textarea name="dataSources" rows={2} placeholder="GA4, Google Ads, GoHighLevel" />
        </Field>

        <Field label="Known limitations" hint="Anything the numbers do not capture.">
          <Textarea name="knownLimitations" rows={2} />
        </Field>

        <Field label="Recommended actions">
          <Textarea name="recommendedActions" rows={3} placeholder="What we suggest next period" />
        </Field>

        <Field label="Document link" hint="Optional. The finished report, wherever it lives.">
          <Input name="documentUrl" placeholder="https://" />
        </Field>

        {/*
          * Not decoration: review refuses an unvalidated report, so a draft
          * created without this can never be submitted and there is nowhere
          * else to tick it afterwards. It can be left unticked deliberately -
          * the draft is then parked until somebody has checked the figures.
          */}
        <label className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
          <input
            type="checkbox"
            name="dataValidated"
            defaultChecked
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
          />
          <span className="text-[11px] leading-4 text-slate-600">
            The figures were checked against their sources. Review will not accept the report
            until somebody confirms this.
          </span>
        </label>

        <ErrorLine message={error} />

        <Button type="submit" size="sm" disabled={busy} className="w-full gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {busy ? "Creating..." : "Create draft"}
        </Button>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Report library                                                             */
/* -------------------------------------------------------------------------- */

const NEXT_STEP: Record<string, { action: string; label: string } | undefined> = {
  DRAFT: { action: "submit", label: "Submit for review" },
  IN_REVIEW: { action: "approve", label: "Approve" },
  APPROVED: { action: "send", label: "Send to client" },
  SENT: { action: "acknowledge", label: "Mark acknowledged" },
};

/**
 * Every report on this client, with the one move its status allows.
 *
 * The lifecycle belongs to the review endpoint - it decides whether a draft
 * may be approved or an unapproved report sent - so this offers the next step
 * and lets the server refuse anything it should.
 */
export function ReportsDialog({
  reports,
  canManage,
  onClose,
}: {
  reports: ReportRow[];
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { busy, error, send } = useMutation(() => router.refresh());
  const [filter, setFilter] = useState<string>("all");
  /* Which report is having changes requested, if any. */
  const [rejecting, setRejecting] = useState<string | null>(null);

  const filters = ["all", "DRAFT", "IN_REVIEW", "APPROVED", "SENT"];
  const shown =
    filter === "all" ? reports : reports.filter((report) => report.status === filter);

  return (
    <Modal
      eyebrow="Reporting"
      title="Reports"
      onClose={onClose}
      footer={
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {filters.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition",
              filter === option
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            {option === "all" ? "All" : formatEnumLabel(option)} (
            {option === "all"
              ? reports.length
              : reports.filter((report) => report.status === option).length}
            )
          </button>
        ))}
      </div>

      <ErrorLine message={error} />

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
          {reports.length === 0 ? "No reports created yet." : "No reports with that status."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((report) => {
            const step = NEXT_STEP[report.status];

            return (
              <section key={report.id} className="rounded-xl border border-slate-200 p-3">
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">
                      {formatEnumLabel(report.type)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(report.periodStart).toLocaleDateString()} -{" "}
                      {new Date(report.periodEnd).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    tone={
                      report.status === "SENT" || report.status === "ACKNOWLEDGED"
                        ? "emerald"
                        : report.status === "LATE"
                          ? "rose"
                          : report.status === "IN_REVIEW"
                            ? "amber"
                            : "slate"
                    }
                  >
                    {formatEnumLabel(report.status)}
                  </Badge>
                </header>

                <dl className="mt-1.5 grid grid-cols-3 gap-2">
                  {[
                    ["Prepared by", report.preparedByName ?? "Unassigned"],
                    ["Due", report.dueAt ? new Date(report.dueAt).toLocaleDateString() : "-"],
                    ["Sent", report.sentAt ? new Date(report.sentAt).toLocaleDateString() : "-"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] uppercase tracking-wide text-slate-400">
                        {label}
                      </dt>
                      <dd className="truncate text-[11px] font-medium text-slate-700">{value}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.documentUrl ? (
                    <a
                      href={report.documentUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Open document
                    </a>
                  ) : null}

                  {canManage && step ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2.5 text-[11px]"
                      disabled={busy}
                      onClick={() =>
                        void send(`/api/reports/${report.id}/review`, { action: step.action })
                      }
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                      {step.label}
                    </Button>
                  ) : null}

                  {/*
                    * A reviewer who can approve has to be able to say no.
                    * Sending it back is the other half of reviewing, and the
                    * endpoint insists on a note so the author knows what to fix.
                    */}
                  {canManage && report.status === "IN_REVIEW" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2.5 text-[11px]"
                      onClick={() => setRejecting(rejecting === report.id ? null : report.id)}
                    >
                      Request changes
                    </Button>
                  ) : null}
                </div>

                {rejecting === report.id ? (
                  <form
                    className="mt-2 space-y-1.5 rounded-lg border border-slate-200 p-2"
                    action={(formData) =>
                      void send(`/api/reports/${report.id}/review`, {
                        action: "requestChanges",
                        note: String(formData.get("note") ?? ""),
                      }).then((ok) => {
                        /* Only on success - a refused note has to stay on
                           screen next to the reason it was refused. */
                        if (ok) setRejecting(null);
                      })
                    }
                  >
                    <Textarea
                      name="note"
                      rows={2}
                      required
                      placeholder="What needs changing before this goes to the client"
                    />
                    <Button type="submit" size="sm" disabled={busy} className="h-7 px-2.5 text-[11px]">
                      Send back to the author
                    </Button>
                  </form>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[10px] leading-4 text-slate-400">
        Sending marks the report sent and records who sent it. There is no mail service in this
        application, so the document itself still goes to the client by hand.
      </p>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Optimizations                                                              */
/* -------------------------------------------------------------------------- */

export function LogOptimizationDialog({
  clientId,
  owners,
  services,
  tasks,
  metrics,
  existing,
  onClose,
}: {
  clientId: string;
  owners: { id: string; name: string }[];
  /** This client's services, so the list cannot name one they do not buy. */
  services: { value: string; label: string }[];
  /** Existing tasks on this client. Selecting one links it; none is created. */
  tasks: { id: string; title: string }[];
  metrics: string[];
  /** Set when editing, which posts to the same endpoint with an id. */
  existing?: OptimizationDetail | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { busy, error, send } = useMutation(() => {
    router.refresh();
    onClose();
  });

  /*
   * One key for this open form.
   *
   * `busy` stops the second click of a double-click, but not a second tab, a
   * retried request or a browser that fires the submit twice. The key does:
   * the column is unique, so a repeat is handed the first record instead of
   * creating a twin. Stable for as long as the dialog is open, and a new one
   * next time it is opened - which is a new intention.
   */
  const [submissionKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  return (
    <Modal
      eyebrow="Optimization"
      title={existing ? "Edit optimization" : "Log an optimization"}
      onClose={onClose}
      footer={
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <form
        className="space-y-3"
        action={(formData) =>
          void send(`/api/clients/${clientId}/optimizations`, {
            optimizationId: existing?.id ?? "",
            /* Editing already targets a row by id, so only a new one needs this. */
            idempotencyKey: existing ? "" : submissionKey,
            title: String(formData.get("title") ?? ""),
            platform: String(formData.get("platform") ?? ""),
            observedProblem: String(formData.get("observedProblem") ?? ""),
            proposedChange: String(formData.get("proposedChange") ?? ""),
            evidence: String(formData.get("evidence") ?? ""),
            hypothesis: String(formData.get("hypothesis") ?? ""),
            expectedMetric: String(formData.get("expectedMetric") ?? ""),
            previousSetting: String(formData.get("previousSetting") ?? ""),
            newSetting: String(formData.get("newSetting") ?? ""),
            startDate: String(formData.get("startDate") ?? ""),
            endDate: String(formData.get("endDate") ?? ""),
            ownerId: String(formData.get("ownerId") ?? ""),
            priority: String(formData.get("priority") ?? "MEDIUM"),
            serviceType: String(formData.get("serviceType") ?? ""),
            taskId: String(formData.get("taskId") ?? ""),
            notes: String(formData.get("notes") ?? ""),
          })
        }
      >
        <Field label="Optimization name">
          <Input
            name="title"
            required
            maxLength={200}
            defaultValue={existing?.title ?? ""}
            placeholder="Improve mobile page speed"
          />
        </Field>

        <Field label="Reason / problem" hint="What this is meant to solve.">
          <Textarea
            name="observedProblem"
            required
            rows={2}
            defaultValue={existing?.observedProblem ?? ""}
            placeholder="Slow load times on mobile"
          />
        </Field>

        <Field label="What is being changed">
          <Input
            name="proposedChange"
            required
            maxLength={2000}
            defaultValue={existing?.proposedChange ?? ""}
            placeholder="Compress hero images and defer third-party scripts"
          />
        </Field>

        <Field label="Expected result" hint="What success would look like.">
          <Textarea
            name="hypothesis"
            rows={2}
            defaultValue={existing?.hypothesis ?? ""}
            placeholder="Increase mobile conversion rate by 10%"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Priority">
            <Select name="priority" defaultValue={existing?.priority ?? "MEDIUM"}>
              {OPTIMIZATION_PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owner">
            <Select name="ownerId" defaultValue={existing?.ownerId ?? ""}>
              <option value="">Unassigned</option>
              {owners.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Platform">
            <Input
              name="platform"
              required
              maxLength={120}
              defaultValue={existing?.platform ?? ""}
              placeholder="Website"
            />
          </Field>
          <Field label="Related service" hint="Only what this client buys.">
            <Select name="serviceType" defaultValue={existing?.serviceType ?? ""}>
              <option value="">Not service specific</option>
              {services.map((service) => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Related metric" hint="What will be read to judge this.">
          <Input
            name="expectedMetric"
            maxLength={200}
            list="optimization-metrics"
            defaultValue={existing?.expectedMetric ?? ""}
            placeholder="Conversion rate"
          />
          <datalist id="optimization-metrics">
            {metrics.map((metric) => (
              <option key={metric} value={metric} />
            ))}
          </datalist>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Start date">
            <Input
              type="date"
              name="startDate"
              defaultValue={existing?.startDate ? isoDate(new Date(existing.startDate)) : ""}
            />
          </Field>
          <Field label="Target review date">
            <Input
              type="date"
              name="endDate"
              defaultValue={existing?.endDate ? isoDate(new Date(existing.endDate)) : ""}
            />
          </Field>
        </div>

        {/*
          * Links an existing task; never creates one. An optimization is what
          * we are trying to improve and a task is the work - the task system
          * already owns the second, and duplicating it here would put the same
          * job in two places with two states.
          */}
        <Field label="Related task" hint="Optional. Links existing work; creates none.">
          <Select name="taskId" defaultValue={existing?.task?.id ?? ""}>
            <option value="">No linked task</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Evidence" hint="What made this worth doing.">
          <Textarea
            name="evidence"
            rows={2}
            defaultValue={existing?.evidence ?? ""}
            placeholder="Mobile LCP at 4.2s in the last audit"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Setting before">
            <Input
              name="previousSetting"
              maxLength={1000}
              defaultValue={existing?.previousSetting ?? ""}
            />
          </Field>
          <Field label="Setting after">
            <Input
              name="newSetting"
              maxLength={1000}
              defaultValue={existing?.newSetting ?? ""}
            />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea name="notes" rows={2} defaultValue={existing?.notes ?? ""} />
        </Field>

        <ErrorLine message={error} />

        <Button type="submit" size="sm" disabled={busy} className="w-full gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {busy ? "Saving..." : existing ? "Save changes" : "Log optimization"}
        </Button>
      </form>
    </Modal>
  );
}

/**
 * Recording what an optimization actually did.
 *
 * The decision is required, because "completed" on its own says nothing worth
 * keeping. What makes this history useful next quarter is the pair - what was
 * expected, and what happened - so the expected metric is shown while the
 * actual is typed.
 */
export function CompleteOptimizationDialog({
  clientId,
  optimization,
  onClose,
}: {
  clientId: string;
  optimization: OptimizationRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { busy, error, send } = useMutation(() => {
    router.refresh();
    onClose();
  });

  return (
    <Modal
      eyebrow={optimization.platform}
      title="Record the result"
      onClose={onClose}
      footer={
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <form
        className="space-y-3"
        action={(formData) =>
          void send(`/api/clients/${clientId}/optimizations`, {
            // The same record, not a second one.
            optimizationId: optimization.id,
            platform: optimization.platform,
            observedProblem: optimization.observedProblem,
            proposedChange: optimization.proposedChange,
            expectedMetric: optimization.expectedMetric ?? "",
            result: String(formData.get("result") ?? ""),
            decision: String(formData.get("decision") ?? ""),
            endDate: String(formData.get("endDate") ?? ""),
          })
        }
      >
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-900">{optimization.proposedChange}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{optimization.observedProblem}</p>
          {optimization.expectedMetric ? (
            <p className="mt-1 text-[11px] font-medium text-slate-700">
              Expected: {optimization.expectedMetric}
            </p>
          ) : null}
        </div>

        <Field label="What actually happened" hint="The measured outcome, in the same terms.">
          <Textarea
            name="result"
            required
            rows={2}
            placeholder="Conversion rate up 7.8% over four weeks"
          />
        </Field>

        <Field label="Decision" hint="What the agency concluded, and what happens to the change.">
          <Select name="decision" defaultValue="KEEP">
            <option value="KEEP">Keep - it worked</option>
            <option value="ADJUST">Adjust - partly worked</option>
            <option value="REVERSE">Reverse - it did not work</option>
            <option value="CONTINUE_TESTING">Continue testing - not enough data</option>
            <option value="INCONCLUSIVE">Inconclusive</option>
          </Select>
        </Field>

        <Field label="End date">
          <Input type="date" name="endDate" defaultValue={isoDate(new Date())} required />
        </Field>

        <ErrorLine message={error} />

        <Button type="submit" size="sm" disabled={busy} className="w-full gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {busy ? "Recording..." : "Record result"}
        </Button>
      </form>
    </Modal>
  );
}
