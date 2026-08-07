"use client";

import { FlaskConical, LoaderCircle, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, formatEnumLabel } from "@/lib/utils";

export interface ReportRow {
  id: string;
  type: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  dueAt: string | null;
  sentAt: string | null;
  dataValidated: boolean;
  dataSources: string | null;
  knownLimitations: string | null;
  recommendedActions: string | null;
  documentUrl: string | null;
  preparedByName: string | null;
  preparedById: string | null;
  reviewedByName: string | null;
  acknowledged: boolean;
  isLate: boolean;
}

export interface OptimizationRow {
  id: string;
  platform: string;
  observedProblem: string;
  proposedChange: string;
  hypothesis: string | null;
  expectedMetric: string | null;
  previousSetting: string | null;
  newSetting: string | null;
  result: string | null;
  decision: string;
  ownerName: string | null;
  startDate: string | null;
  endDate: string | null;
  isConcluded: boolean;
}

const STATUS_TONE: Record<string, "slate" | "amber" | "emerald" | "sky" | "rose"> = {
  DRAFT: "slate",
  IN_REVIEW: "amber",
  APPROVED: "sky",
  SENT: "emerald",
  ACKNOWLEDGED: "emerald",
  LATE: "rose",
};

const DECISION_TONE: Record<string, "slate" | "amber" | "emerald" | "rose"> = {
  PENDING: "amber",
  KEEP: "emerald",
  ADJUST: "amber",
  REVERSE: "rose",
  CONTINUE_TESTING: "amber",
  INCONCLUSIVE: "slate",
};

const areaClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

export function ClientReporting({
  clientId,
  canManage,
  currentUserId,
  reports,
  optimizations,
  reportTypes,
  decisions,
  owners,
}: {
  clientId: string;
  canManage: boolean;
  currentUserId: string;
  reports: ReportRow[];
  optimizations: OptimizationRow[];
  reportTypes: { value: string; label: string }[];
  decisions: { value: string; label: string }[];
  owners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"report" | "optimization" | null>(null);
  const [editingOptimizationId, setEditingOptimizationId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const late = reports.filter((report) => report.isLate);
  const editingOptimization =
    optimizations.find((item) => item.id === editingOptimizationId) ?? null;
  const today = new Date().toISOString().slice(0, 10);

  function post(url: string, body: unknown, onDone?: () => void) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(url, {
        method: "POST",
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
          <CardTitle>Reporting and optimization</CardTitle>
          <CardDescription>
            What we told the client, and what we changed because of it. A report needs
            checked figures and a second reader before it goes out.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {late.length ? <Badge tone="rose">{late.length} late</Badge> : null}
          <Badge tone="slate">{reports.length} report(s)</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        ) : null}

        {reports.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            No reports yet. Weekly updates and monthly reports are how the client sees
            what they are paying for.
          </p>
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => {
              const isAuthor = report.preparedById === currentUserId;

              return (
                <li
                  key={report.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    report.isLate
                      ? "border-rose-200 bg-rose-50/50"
                      : report.acknowledged
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {formatEnumLabel(report.type)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatDate(new Date(report.periodStart))} to{" "}
                        {formatDate(new Date(report.periodEnd))}
                        {report.dueAt ? ` · due ${formatDate(new Date(report.dueAt))}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {report.isLate ? <Badge tone="rose">Late</Badge> : null}
                      <Badge tone={STATUS_TONE[report.status] ?? "slate"}>
                        {formatEnumLabel(report.status)}
                      </Badge>
                    </div>
                  </div>

                  {!report.dataValidated ? (
                    <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-amber-800">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      Nobody has confirmed the figures were checked against their sources.
                    </p>
                  ) : null}

                  {report.knownLimitations ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Limitations: {report.knownLimitations}
                    </p>
                  ) : null}

                  {report.documentUrl ? (
                    <p className="mt-2 truncate text-sm">
                      <a
                        href={report.documentUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-sky-700 underline underline-offset-2"
                      >
                        {report.documentUrl}
                      </a>
                    </p>
                  ) : null}

                  <p className="mt-2 text-xs text-slate-400">
                    Prepared by {report.preparedByName ?? "unknown"}
                    {report.reviewedByName ? ` · reviewed by ${report.reviewedByName}` : ""}
                    {report.sentAt ? ` · sent ${formatDate(new Date(report.sentAt))}` : ""}
                  </p>

                  {canManage && !report.sentAt ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {report.status === "DRAFT" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={isPending}
                          onClick={() =>
                            post(`/api/reports/${report.id}/review`, { action: "submit" })
                          }
                        >
                          Send for review
                        </Button>
                      ) : null}

                      {report.status === "IN_REVIEW" ? (
                        isAuthor ? (
                          <span className="inline-flex items-start gap-2 text-sm leading-6 text-amber-800">
                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            You prepared this, so somebody else has to review it.
                          </span>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              disabled={isPending}
                              onClick={() =>
                                post(`/api/reports/${report.id}/review`, { action: "approve" })
                              }
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => setRejectingId(report.id)}
                            >
                              Ask for changes
                            </Button>
                          </>
                        )
                      ) : null}

                      {report.status === "APPROVED" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            post(`/api/reports/${report.id}/review`, { action: "send" })
                          }
                        >
                          Mark as sent
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {canManage && report.sentAt && !report.acknowledged ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      disabled={isPending}
                      onClick={() =>
                        post(`/api/reports/${report.id}/review`, { action: "acknowledge" })
                      }
                    >
                      Client confirmed they read it
                    </Button>
                  ) : null}

                  {rejectingId === report.id ? (
                    <form
                      action={(formData) =>
                        post(
                          `/api/reports/${report.id}/review`,
                          {
                            action: "requestChanges",
                            note: String(formData.get("note") ?? "").trim(),
                          },
                          () => setRejectingId(null),
                        )
                      }
                      className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3"
                    >
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-600">
                          What needs changing?
                        </span>
                        <Input name="note" required placeholder="The spend figure does not match the platform" />
                      </label>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={isPending}>
                          Send back
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setRejectingId(null)}
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

        {optimizations.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Optimizations</p>
            {optimizations.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">
                    {item.platform}: {item.observedProblem}
                  </p>
                  <Badge tone={DECISION_TONE[item.decision] ?? "slate"}>
                    {formatEnumLabel(item.decision)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  Changed: {item.proposedChange}
                </p>
                {item.previousSetting || item.newSetting ? (
                  <p className="mt-1.5 text-sm leading-6 text-slate-500">
                    {item.previousSetting ?? "unrecorded"} → {item.newSetting ?? "unrecorded"}
                  </p>
                ) : null}
                {item.result ? (
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">
                    Result: {item.result}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-400">
                  {item.ownerName ?? "Unassigned"}
                  {item.expectedMetric ? ` · measuring ${item.expectedMetric}` : ""}
                </p>
                {canManage && !item.isConcluded ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => {
                      setEditingOptimizationId(item.id);
                      setPanel("optimization");
                    }}
                  >
                    Record the result
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {canManage && panel === "report" ? (
          <form
            action={(formData) =>
              post(
                `/api/clients/${clientId}/reports`,
                {
                  type: String(formData.get("type") ?? ""),
                  periodStart: String(formData.get("periodStart") ?? ""),
                  periodEnd: String(formData.get("periodEnd") ?? ""),
                  dueAt: String(formData.get("dueAt") ?? ""),
                  dataSources: String(formData.get("dataSources") ?? "").trim(),
                  knownLimitations: String(formData.get("knownLimitations") ?? "").trim(),
                  recommendedActions: String(formData.get("recommendedActions") ?? "").trim(),
                  documentUrl: String(formData.get("documentUrl") ?? "").trim(),
                  dataValidated: formData.get("dataValidated") === "on",
                },
                () => setPanel(null),
              )
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Report type</span>
                <Select name="type" defaultValue={reportTypes[0]?.value}>
                  {reportTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Due to the client</span>
                <Input type="date" name="dueAt" />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Period start</span>
                <Input type="date" name="periodStart" required max={today} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Period end</span>
                <Input type="date" name="periodEnd" required />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                Where the numbers came from
              </span>
              <textarea
                name="dataSources"
                rows={2}
                className={areaClass}
                placeholder="Meta Ads Manager, GA4, GoHighLevel opportunities"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                What the numbers cannot tell them
              </span>
              <textarea
                name="knownLimitations"
                rows={2}
                className={areaClass}
                placeholder="Offline sales are not tracked, so revenue is understated"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">Recommended actions</span>
              <textarea name="recommendedActions" rows={2} className={areaClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">Link to the document</span>
              <Input name="documentUrl" />
            </label>
            <label className="flex items-start gap-2 text-sm leading-6 text-slate-600">
              <input type="checkbox" name="dataValidated" className="mt-1 h-4 w-4" />
              I checked these figures against their sources. Required before anyone can
              review or send it.
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Save draft
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {canManage && panel === "optimization" ? (
          <form
            action={(formData) =>
              post(
                `/api/clients/${clientId}/optimizations`,
                {
                  optimizationId: editingOptimization?.id ?? "",
                  platform: String(formData.get("platform") ?? "").trim(),
                  observedProblem: String(formData.get("observedProblem") ?? "").trim(),
                  hypothesis: String(formData.get("hypothesis") ?? "").trim(),
                  proposedChange: String(formData.get("proposedChange") ?? "").trim(),
                  expectedMetric: String(formData.get("expectedMetric") ?? "").trim(),
                  previousSetting: String(formData.get("previousSetting") ?? "").trim(),
                  newSetting: String(formData.get("newSetting") ?? "").trim(),
                  result: String(formData.get("result") ?? "").trim(),
                  decision: String(formData.get("decision") ?? "PENDING"),
                  ownerId: String(formData.get("ownerId") ?? ""),
                },
                () => {
                  setPanel(null);
                  setEditingOptimizationId(null);
                },
              )
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Platform</span>
                <Input
                  name="platform"
                  required
                  placeholder="Meta Ads"
                  defaultValue={editingOptimization?.platform ?? ""}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Owner</span>
                <Select name="ownerId" defaultValue="">
                  <option value="">Me</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">What did you see?</span>
              <Input
                name="observedProblem"
                required
                defaultValue={editingOptimization?.observedProblem ?? ""}
                placeholder="Cost per lead climbed 40% over two weeks"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">Why you think that is</span>
              <Input name="hypothesis" defaultValue={editingOptimization?.hypothesis ?? ""} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">What you changed</span>
              <Input
                name="proposedChange"
                required
                defaultValue={editingOptimization?.proposedChange ?? ""}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Setting before</span>
                <Input
                  name="previousSetting"
                  defaultValue={editingOptimization?.previousSetting ?? ""}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Setting after</span>
                <Input
                  name="newSetting"
                  defaultValue={editingOptimization?.newSetting ?? ""}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Measuring</span>
                <Input
                  name="expectedMetric"
                  placeholder="Cost per qualified lead"
                  defaultValue={editingOptimization?.expectedMetric ?? ""}
                />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">What happened</span>
              <textarea
                name="result"
                rows={2}
                className={areaClass}
                defaultValue={editingOptimization?.result ?? ""}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">Decision</span>
              <Select name="decision" defaultValue={editingOptimization?.decision ?? "PENDING"}>
                {decisions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <span className="block text-xs leading-5 text-slate-500">
                Deciding needs the result and the setting it replaced — otherwise there is
                nothing to compare against.
              </span>
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {editingOptimization ? "Update" : "Record optimization"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPanel(null);
                  setEditingOptimizationId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {canManage && panel === null ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setPanel("report")}>
              Prepare a report
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => {
                setEditingOptimizationId(null);
                setPanel("optimization");
              }}
            >
              <FlaskConical className="h-4 w-4" />
              Record an optimization
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
