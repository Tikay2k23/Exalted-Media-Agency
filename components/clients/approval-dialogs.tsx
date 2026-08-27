"use client";

/**
 * The working surfaces behind the Approvals cards.
 *
 * Each of these posts to an endpoint that already existed and already carried
 * the permission check, the validation and the audit entry - recordTestResult,
 * createDefect, closeDefect, setChecklistItemStatus, recordApproval. Nothing
 * here decides whether an action is allowed; the server does, and these render
 * what it says when it refuses.
 *
 * They exist because the summary cards used to link down the page to three
 * older workspaces that did this work. Two views of the same records is one
 * view too many, so the cards now open these and the old workspaces are gone.
 */

import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Modal } from "@/components/journey/client/journey-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DefectRow, LaunchCheck, QaCheck } from "@/lib/quality/approval-gate";
import { cn, formatEnumLabel } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Shared plumbing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One request, with the states a mutation button needs.
 *
 * `busy` doubles as the guard against a second click: every caller disables on
 * it, so a jammed button cannot post twice. The server is idempotent where it
 * matters, but not sending the second request at all is cheaper than deciding
 * what to do with it.
 */
function useMutation(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, method: "POST" | "PATCH", body: unknown) {
    if (busy) return false;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        /*
         * The server's own words. It knows which of a dozen rules refused -
         * an unauthorised seat, a defect that must be retested first, a
         * record somebody else already changed - and a generic failure
         * message would throw all of that away.
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

const STATUS_TONE: Record<string, string> = {
  PASSED: "text-emerald-600",
  COMPLETE: "text-emerald-600",
  FAILED: "text-rose-600",
  BLOCKED: "text-rose-600",
  RETEST_REQUIRED: "text-amber-600",
  IN_PROGRESS: "text-amber-600",
};

/* -------------------------------------------------------------------------- */
/* QA checklist                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Every QA check, with the two results a tester can record.
 *
 * Failing one demands the actual result - enforced by the schema behind the
 * endpoint, not merely asked for here - because a failure nobody wrote down is
 * a failure nobody can act on. The previous result is never erased: the
 * endpoint records a new outcome against the same test.
 */
export function QaChecklistDialog({
  checks,
  canTest,
  onClose,
  onRaiseDefect,
}: {
  checks: QaCheck[];
  canTest: boolean;
  onClose: () => void;
  onRaiseDefect: (check: QaCheck) => void;
}) {
  const router = useRouter();
  const { busy, error, setError, send } = useMutation(() => router.refresh());
  const [active, setActive] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");

  async function record(check: QaCheck, status: "PASSED" | "FAILED" | "RETEST_REQUIRED") {
    if (status === "FAILED" && !note.trim()) {
      setError("A failed check needs the actual result recorded.");
      return;
    }

    const ok = await send(`/api/qa-tests/${check.id}`, "PATCH", {
      status,
      actualResult: note.trim(),
      evidenceUrl: evidence.trim(),
    });

    if (ok) {
      setActive(null);
      setNote("");
      setEvidence("");
    }
  }

  return (
    <Modal
      eyebrow="Internal quality assurance"
      title="QA checklist"
      onClose={onClose}
      footer={
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {checks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
          No QA checks configured.
        </p>
      ) : (
        <div className="space-y-2">
          <ErrorLine message={error} />

          {checks.map((check) => (
            <section key={check.id} className="rounded-xl border border-slate-200 p-3">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">{check.objective}</p>
                  <p className="text-[11px] text-slate-500">
                    {check.planName}
                    {check.testerName ? ` - ${check.testerName}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold",
                    STATUS_TONE[check.status] ?? "text-slate-400",
                  )}
                >
                  {formatEnumLabel(check.status)}
                  {check.retestRequired && check.status !== "RETEST_REQUIRED"
                    ? " - retest due"
                    : ""}
                </span>
              </header>

              {check.evidenceUrl ? (
                <a
                  href={check.evidenceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1 inline-block text-[11px] text-sky-700 hover:underline"
                >
                  Evidence on file
                </a>
              ) : null}

              {canTest ? (
                active === check.id ? (
                  <div className="mt-2 space-y-2">
                    <Field label="What actually happened" hint="Required to fail a check.">
                      <Textarea
                        rows={2}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Confirmation email did not arrive on the thank-you page"
                      />
                    </Field>
                    <Field label="Evidence link" hint="Optional. A screenshot or recording.">
                      <Input
                        value={evidence}
                        onChange={(event) => setEvidence(event.target.value)}
                        placeholder="https://"
                      />
                    </Field>

                    <div className="flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" disabled={busy} onClick={() => record(check, "PASSED")}>
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Mark passed
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => record(check, "FAILED")}
                      >
                        Mark failed
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => record(check, "RETEST_REQUIRED")}
                      >
                        Needs retest
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setActive(null);
                          setError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setActive(check.id);
                        setNote("");
                        setEvidence("");
                        setError(null);
                      }}
                    >
                      Record result
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onRaiseDefect(check)}
                    >
                      Raise defect
                    </Button>
                  </div>
                )
              ) : (
                <p className="mt-2 text-[11px] text-slate-400">
                  Recording a QA result needs the QA testing permission.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Raise defect                                                               */
/* -------------------------------------------------------------------------- */

export function RaiseDefectDialog({
  clientId,
  assignees,
  projects,
  prefillFrom,
  onClose,
}: {
  clientId: string;
  assignees: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  /** The QA check this came from, where it did. */
  prefillFrom: QaCheck | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { busy, error, send } = useMutation(() => {
    router.refresh();
    onClose();
  });

  return (
    <Modal
      eyebrow="Quality"
      title="Raise a defect"
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
          void send(`/api/clients/${clientId}/defects`, "POST", {
            title: String(formData.get("title") ?? ""),
            severity: String(formData.get("severity") ?? "MEDIUM"),
            description: String(formData.get("description") ?? ""),
            /* The check it came from, so the defect says what failed. */
            deliverable: prefillFrom?.planName ?? "",
            actualResult: "",
            expectedResult: "",
            stepsToReproduce: "",
            evidenceUrl: String(formData.get("evidenceUrl") ?? ""),
            assignedToId: String(formData.get("assignedToId") ?? ""),
            projectId: String(formData.get("projectId") ?? ""),
            dueDate: String(formData.get("dueDate") ?? ""),
          })
        }
      >
        {prefillFrom ? (
          <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
            Raised against the QA check: {prefillFrom.objective}
          </p>
        ) : null}

        <Field label="Title">
          <Input
            name="title"
            required
            minLength={2}
            maxLength={160}
            defaultValue={prefillFrom ? `${prefillFrom.objective} failed` : ""}
            placeholder="Form confirmation email not firing"
          />
        </Field>

        <Field label="Severity" hint="Critical and high stop the client seeing the work.">
          <Select name="severity" defaultValue="MEDIUM">
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </Select>
        </Field>

        <Field label="Description">
          <Textarea
            name="description"
            required
            minLength={2}
            rows={3}
            placeholder="What is wrong, and what should happen instead"
          />
        </Field>

        <Field label="Owner" hint="Who fixes it. Optional.">
          <Select name="assignedToId" defaultValue="">
            <option value="">Unassigned</option>
            {assignees.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Project">
            <Select name="projectId" defaultValue="">
              <option value="">None</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input type="date" name="dueDate" />
          </Field>
        </div>

        <Field label="Evidence link" hint="Optional.">
          <Input name="evidenceUrl" placeholder="https://" />
        </Field>

        <ErrorLine message={error} />

        <Button type="submit" size="sm" disabled={busy} className="w-full gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {busy ? "Raising..." : "Raise defect"}
        </Button>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Defects                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every defect on this client, with the moves its status allows.
 *
 * Closing goes through the closure endpoint, which is the one that knows a
 * defect needing a retest cannot simply be shut - so the rule is enforced
 * where it belongs rather than by hiding a button.
 */
export function DefectsDialog({
  defects,
  canClose,
  onClose,
  onRaise,
}: {
  defects: DefectRow[];
  canClose: boolean;
  onClose: () => void;
  onRaise: () => void;
}) {
  const router = useRouter();
  const { busy, error, send } = useMutation(() => router.refresh());
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [closing, setClosing] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const OPEN = new Set(["NEW", "ASSIGNED", "IN_PROGRESS", "READY_FOR_RETEST", "REOPENED", "BLOCKED"]);
  const shown = filter === "open" ? defects.filter((d) => OPEN.has(d.status)) : defects;

  return (
    <Modal
      eyebrow="Quality"
      title="Defects"
      onClose={onClose}
      footer={
        <>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="button" size="sm" onClick={onRaise}>
            Raise defect
          </Button>
        </>
      }
    >
      <div className="mb-3 flex gap-1.5">
        {(["open", "all"] as const).map((option) => (
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
            {option === "open" ? "Open" : "All"} (
            {option === "open" ? defects.filter((d) => OPEN.has(d.status)).length : defects.length})
          </button>
        ))}
      </div>

      <ErrorLine message={error} />

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
          {filter === "open" ? "No open defects." : "No defects on this client."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((entry) => (
            <section key={entry.id} className="rounded-xl border border-slate-200 p-3">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 text-xs font-semibold text-slate-900">{entry.title}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                    entry.severity === "CRITICAL" || entry.severity === "HIGH"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : entry.severity === "MEDIUM"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-slate-50 text-slate-600",
                  )}
                >
                  {entry.severity}
                </span>
              </header>

              <dl className="mt-1.5 grid grid-cols-3 gap-2">
                {[
                  ["Reference", entry.reference],
                  ["Owner", entry.assignedToName ?? "Unassigned"],
                  ["Status", formatEnumLabel(entry.status)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className="truncate text-[11px] font-medium text-slate-700">{value}</dd>
                  </div>
                ))}
              </dl>

              {canClose && OPEN.has(entry.status) ? (
                closing === entry.id ? (
                  <div className="mt-2 space-y-2">
                    <Field label="What was done" hint="Recorded against the defect.">
                      <Input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Reconnected the automation trigger and retested"
                      />
                    </Field>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={async () => {
                          const ok = await send(`/api/defects/${entry.id}/close`, "POST", {
                            resolution: "PASSED",
                            retestResult: note.trim(),
                          });
                          if (ok) {
                            setClosing(null);
                            setNote("");
                          }
                        }}
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Resolve
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setClosing(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.status !== "IN_PROGRESS" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void send(`/api/defects/${entry.id}`, "PATCH", { status: "IN_PROGRESS" })
                        }
                      >
                        Start work
                      </Button>
                    ) : null}
                    {entry.status !== "READY_FOR_RETEST" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void send(`/api/defects/${entry.id}`, "PATCH", {
                            status: "READY_FOR_RETEST",
                          })
                        }
                      >
                        Ready for retest
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setClosing(entry.id);
                        setNote("");
                      }}
                    >
                      Resolve
                    </Button>
                  </div>
                )
              ) : null}
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Launch checklist                                                           */
/* -------------------------------------------------------------------------- */

export function LaunchChecklistDialog({
  checks,
  canManage,
  onClose,
}: {
  checks: LaunchCheck[];
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { busy, error, send } = useMutation(() => router.refresh());

  return (
    <Modal
      eyebrow="Launch"
      title="Launch checklist"
      onClose={onClose}
      footer={
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {checks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
          No launch checks configured.
        </p>
      ) : (
        <div className="space-y-2">
          <ErrorLine message={error} />

          {checks.map((check) => {
            const done = check.status === "COMPLETE";

            return (
              <section
                key={check.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    {check.label}
                    {check.isRequired && !done ? (
                      <span className="rounded border border-rose-200 bg-rose-50 px-1 text-[8px] font-bold uppercase text-rose-700">
                        Blocker
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatEnumLabel(check.category)} -{" "}
                    <span className={STATUS_TONE[check.status] ?? "text-slate-400"}>
                      {formatEnumLabel(check.status)}
                    </span>
                  </p>
                </div>

                {canManage ? (
                  <div className="flex shrink-0 gap-1.5">
                    {!done ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void send(`/api/launch-checklist/${check.id}`, "PATCH", {
                            status: "COMPLETE",
                          })
                        }
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        Complete
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void send(`/api/launch-checklist/${check.id}`, "PATCH", {
                            status: "IN_PROGRESS",
                          })
                        }
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Record approval                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The client's sign-off, with the evidence behind it.
 *
 * The approver is chosen from the account's own contacts rather than typed:
 * the service checks the contact belongs to this client and is authorised, and
 * a name in a text box could not be checked at all.
 */
export function RecordApprovalDialog({
  clientId,
  approvers,
  projects,
  approvalTypes,
  onClose,
}: {
  clientId: string;
  approvers: { id: string; name: string; role: string | null }[];
  projects: { id: string; name: string }[];
  approvalTypes: { value: string; label: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { busy, error, send } = useMutation(() => {
    router.refresh();
    onClose();
  });

  if (approvers.length === 0) {
    return (
      <Modal
        eyebrow="Client approval"
        title="Record approval"
        onClose={onClose}
        footer={
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        }
      >
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
          No contact on this account is marked as an authorised approver. Mark one on the
          Account tab first - a sign-off recorded against somebody who cannot give it is
          not evidence of anything.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      eyebrow="Client approval"
      title="Record approval"
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
          void send(`/api/clients/${clientId}/approvals`, "POST", {
            type: String(formData.get("type") ?? ""),
            subject: String(formData.get("subject") ?? ""),
            approverContactId: String(formData.get("approverContactId") ?? ""),
            approvedAt: String(formData.get("approvedAt") ?? ""),
            evidenceUrl: String(formData.get("evidenceUrl") ?? ""),
            notes: String(formData.get("notes") ?? ""),
            projectId: String(formData.get("projectId") ?? ""),
          })
        }
      >
        <Field label="What was approved">
          <Input
            name="subject"
            required
            minLength={2}
            maxLength={200}
            placeholder="Funnel Build - round 2 deliverables"
          />
        </Field>

        <Field label="Approval type">
          <Select name="type" defaultValue={approvalTypes[0]?.value}>
            {approvalTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Approved by" hint="Authorised approvers on this account.">
          <Select name="approverContactId" defaultValue={approvers[0]?.id}>
            {approvers.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
                {contact.role ? ` - ${contact.role}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Approved on">
            <Input type="date" name="approvedAt" />
          </Field>
          <Field label="Project">
            <Select name="projectId" defaultValue="">
              <option value="">None</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Evidence"
          hint="The email, signed document or recording. Without it the sign-off does not count towards launch."
        >
          <Input name="evidenceUrl" placeholder="https://" />
        </Field>

        <Field label="Internal note" hint="Optional.">
          <Textarea name="notes" rows={2} placeholder="Approved on the Tuesday call" />
        </Field>

        <ErrorLine message={error} />

        <Button type="submit" size="sm" disabled={busy} className="w-full gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          {busy ? "Recording..." : "Record approval"}
        </Button>
      </form>
    </Modal>
  );
}
