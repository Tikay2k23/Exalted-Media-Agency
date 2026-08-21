"use client";

import { Bug, ClipboardCheck, LoaderCircle, Plus, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatDate, formatEnumLabel } from "@/lib/utils";

export interface DefectRow {
  id: string;
  reference: string;
  title: string;
  severity: string;
  status: string;
  description: string;
  assignedToName: string | null;
  assignedToId: string | null;
  dueDate: string | null;
  closureOverrideReason: string | null;
  isOpen: boolean;
}

export interface QaTestRow {
  id: string;
  objective: string;
  status: string;
  actualResult: string | null;
}

export interface QaPlanRow {
  id: string;
  name: string;
  deliverable: string;
  status: string;
  tests: QaTestRow[];
}

const SEVERITY_TONE: Record<string, "rose" | "amber" | "sky" | "slate"> = {
  CRITICAL: "rose",
  HIGH: "amber",
  MEDIUM: "sky",
  LOW: "slate",
};

const OPEN_STATUSES = [
  { value: "NEW", label: "New" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_PROGRESS", label: "Being fixed" },
  { value: "READY_FOR_RETEST", label: "Ready for retest" },
  { value: "REOPENED", label: "Reopened" },
  { value: "BLOCKED", label: "Blocked" },
];

const TEST_STATUSES = [
  { value: "NOT_RUN", label: "Not run" },
  { value: "PASSED", label: "Passed" },
  { value: "FAILED", label: "Failed" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "RETEST_REQUIRED", label: "Needs retest" },
  { value: "SKIPPED", label: "Skipped" },
];

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function ClientQuality({
  clientId,
  defects,
  qaPlans,
  assignees,
  currentUserId,
  canTest,
  canClose,
  canApprove,
}: {
  clientId: string;
  defects: DefectRow[];
  qaPlans: QaPlanRow[];
  assignees: { id: string; name: string }[];
  currentUserId: string;
  canTest: boolean;
  canClose: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [raising, setRaising] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [addingPlan, setAddingPlan] = useState(false);
  const [addingTestTo, setAddingTestTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openDefects = defects.filter((defect) => defect.isOpen);
  const openCritical = openDefects.filter((defect) => defect.severity === "CRITICAL");

  function send(
    url: string,
    method: "POST" | "PATCH",
    body: unknown,
    onDone?: () => void,
  ) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "That could not be saved.");
        return;
      }

      onDone?.();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Quality assurance</CardTitle>
          <CardDescription>
            Defects and test plans. Whoever did the work cannot be the only person who
            says it is fixed.
          </CardDescription>
        </div>
        {canTest && !raising ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setRaising(true)}
          >
            <Bug className="h-3.5 w-3.5" />
            Raise defect
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-5">
        {openCritical.length > 0 ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
            {openCritical.length} critical defect
            {openCritical.length === 1 ? " is" : "s are"} still open, which blocks this
            account from client review and launch.
          </p>
        ) : null}

        {/* Defects */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-900">
            Defects {defects.length > 0 ? `(${openDefects.length} open)` : ""}
          </p>

          {defects.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              No defects logged. Raise one when testing finds something wrong.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {defects.map((defect) => {
                const isOwnWork = defect.assignedToId === currentUserId;

                return (
                  <li key={defect.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {defect.reference} · {defect.title}
                        </p>
                        <p className="mt-0.5 text-sm leading-6 text-slate-500">
                          {defect.description}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {defect.assignedToName
                            ? `With ${defect.assignedToName}`
                            : "Unassigned"}
                          {defect.dueDate ? ` · due ${formatDate(defect.dueDate)}` : ""}
                        </p>
                        {defect.closureOverrideReason ? (
                          <p className="mt-1 text-sm text-amber-800">
                            Closed by the person who worked on it —{" "}
                            {defect.closureOverrideReason}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={SEVERITY_TONE[defect.severity] ?? "slate"}>
                          {formatEnumLabel(defect.severity)}
                        </Badge>
                        <Badge tone={defect.isOpen ? "amber" : "emerald"}>
                          {formatEnumLabel(defect.status)}
                        </Badge>
                      </div>
                    </div>

                    {defect.isOpen && canTest ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={defect.status}
                          disabled={isPending}
                          onChange={(event) =>
                            send(`/api/defects/${defect.id}`, "PATCH", {
                              status: event.target.value,
                            })
                          }
                          aria-label={`Status for ${defect.reference}`}
                          className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700"
                        >
                          {OPEN_STATUSES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={defect.assignedToId ?? ""}
                          disabled={isPending}
                          onChange={(event) =>
                            send(`/api/defects/${defect.id}`, "PATCH", {
                              assignedToId: event.target.value,
                            })
                          }
                          aria-label={`Assignee for ${defect.reference}`}
                          className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm text-slate-700"
                        >
                          <option value="">Unassigned</option>
                          {assignees.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.name}
                            </option>
                          ))}
                        </select>

                        {canClose && closingId !== defect.id ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setClosingId(defect.id)}
                          >
                            Close defect
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    {closingId === defect.id ? (
                      <form
                        action={(formData) =>
                          send(
                            `/api/defects/${defect.id}/close`,
                            "POST",
                            {
                              resolution: String(formData.get("resolution") ?? "CLOSED"),
                              retestResult: String(formData.get("retestResult") ?? "").trim(),
                              overrideReason: String(
                                formData.get("overrideReason") ?? "",
                              ).trim(),
                            },
                            () => setClosingId(null),
                          )
                        }
                        className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2"
                      >
                        <Field label="Resolution">
                          <select name="resolution" defaultValue="CLOSED" className={fieldClass}>
                            <option value="CLOSED">Fixed and verified</option>
                            <option value="PASSED">Retested and passed</option>
                            <option value="WONT_FIX">Will not fix</option>
                          </select>
                        </Field>
                        <Field label="What did the retest show?">
                          <Input name="retestResult" placeholder="Retested on staging, form submits" />
                        </Field>

                        {isOwnWork ? (
                          <div className="sm:col-span-2">
                            <div className="mb-2 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                              <ShieldAlert
                                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                                aria-hidden
                              />
                              <p className="text-sm leading-6 text-amber-900">
                                This defect is assigned to you. Normally someone else
                                verifies the fix. If you close it yourself, your reason is
                                stored on the defect and the agency owner is told.
                              </p>
                            </div>
                            <Field label="Why are you closing your own work?">
                              <Input
                                name="overrideReason"
                                placeholder="Sole reviewer available before launch; retested twice"
                              />
                            </Field>
                          </div>
                        ) : null}

                        <div className="flex gap-3 sm:col-span-2">
                          <Button type="submit" size="sm" disabled={isPending} className="gap-2">
                            {isPending ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : null}
                            Close {defect.reference}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setClosingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {raising ? (
          <form
            action={(formData) =>
              send(
                `/api/clients/${clientId}/defects`,
                "POST",
                {
                  title: String(formData.get("title") ?? "").trim(),
                  severity: String(formData.get("severity") ?? "MEDIUM"),
                  description: String(formData.get("description") ?? "").trim(),
                  deliverable: String(formData.get("deliverable") ?? "").trim(),
                  stepsToReproduce: String(formData.get("stepsToReproduce") ?? "").trim(),
                  assignedToId: String(formData.get("assignedToId") ?? ""),
                },
                () => setRaising(false),
              )
            }
            className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"
          >
            <Field label="What is wrong?">
              <Input name="title" placeholder="Contact form does not send" required />
            </Field>
            <Field label="Severity">
              <select name="severity" defaultValue="MEDIUM" className={fieldClass}>
                <option value="CRITICAL">Critical — blocks launch</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </Field>
            <Field label="Deliverable">
              <Input name="deliverable" placeholder="e.g. Contact page" />
            </Field>
            <Field label="Assign to">
              <select name="assignedToId" defaultValue="" className={fieldClass}>
                <option value="">Nobody yet</option>
                {assignees.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <Input name="description" placeholder="What happens, and where" required />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Steps to reproduce">
                <Input name="stepsToReproduce" placeholder="1. Open the page 2. Submit the form" />
              </Field>
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />}
                Raise defect
              </Button>
              <Button type="button" variant="secondary" onClick={() => setRaising(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {/* Test plans */}
        <div className="space-y-3 border-t border-slate-100 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Test plans</p>
            {canTest && !addingPlan ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => setAddingPlan(true)}
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                New test plan
              </Button>
            ) : null}
          </div>

          {qaPlans.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              No test plan yet. A plan records what was checked, not just that checking
              happened.
            </p>
          ) : (
            qaPlans.map((plan) => (
              <div key={plan.id} className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                <p className="mt-0.5 text-sm text-slate-500">{plan.deliverable}</p>

                {plan.tests.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {plan.tests.map((test) => (
                      <li key={test.id} className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "text-sm",
                            test.status === "PASSED"
                              ? "text-slate-500"
                              : test.status === "FAILED"
                                ? "font-medium text-rose-700"
                                : "text-slate-700",
                          )}
                        >
                          {test.objective}
                        </span>
                        {canTest ? (
                          <select
                            value={test.status}
                            disabled={isPending}
                            onChange={(event) =>
                              send(`/api/qa-tests/${test.id}`, "PATCH", {
                                status: event.target.value,
                                // A failing test must say what actually happened,
                                // so the value is carried through from the record.
                                actualResult:
                                  event.target.value === "FAILED"
                                    ? (test.actualResult ?? "Recorded as failed from the test plan.")
                                    : "",
                              })
                            }
                            aria-label={`Result for ${test.objective}`}
                            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                          >
                            {TEST_STATUSES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge tone={test.status === "FAILED" ? "rose" : "slate"}>
                            {formatEnumLabel(test.status)}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {canTest ? (
                  addingTestTo === plan.id ? (
                    <form
                      action={(formData) =>
                        send(
                          `/api/qa-plans/${plan.id}/tests`,
                          "POST",
                          {
                            objective: String(formData.get("objective") ?? "").trim(),
                            steps: String(formData.get("steps") ?? "").trim(),
                            expectedResult: String(formData.get("expectedResult") ?? "").trim(),
                          },
                          () => setAddingTestTo(null),
                        )
                      }
                      className="mt-3 grid gap-2 rounded-xl border border-slate-200 p-3"
                    >
                      <Input name="objective" placeholder="What is being tested" required />
                      <Input name="steps" placeholder="Steps to follow" required />
                      <Input name="expectedResult" placeholder="What should happen" required />
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={isPending}>
                          Add test
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setAddingTestTo(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingTestTo(plan.id)}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add test
                    </button>
                  )
                ) : null}
              </div>
            ))
          )}

          {addingPlan ? (
            <form
              action={(formData) =>
                send(
                  `/api/clients/${clientId}/qa-plans`,
                  "POST",
                  {
                    name: String(formData.get("name") ?? "").trim(),
                    deliverable: String(formData.get("deliverable") ?? "").trim(),
                  },
                  () => setAddingPlan(false),
                )
              }
              className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"
            >
              <Field label="Plan name">
                <Input name="name" placeholder="e.g. Website pre-launch QA" required />
              </Field>
              <Field label="Deliverable being tested">
                <Input name="deliverable" placeholder="e.g. Marketing website" required />
              </Field>
              <div className="flex gap-3 sm:col-span-2">
                <Button type="submit" disabled={isPending} className="gap-2">
                  {isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ClipboardCheck className="h-4 w-4" />
                  )}
                  Create plan
                </Button>
                <Button type="button" variant="secondary" onClick={() => setAddingPlan(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </div>

        {!canApprove && canTest ? (
          <p className="text-sm text-slate-500">
            You can raise and work defects. Closing one needs someone with QA approval.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
