"use client";

import { Activity, HeartPulse, LoaderCircle, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, formatEnumLabel } from "@/lib/utils";

export interface AssessmentRow {
  id: string;
  status: string;
  summary: string | null;
  healthScore: number | null;
  assessedByName: string | null;
  assessedAt: string;
  openComplaints: number;
  cancellationThreat: boolean;
}

export interface ComplaintRow {
  id: string;
  title: string;
  description: string;
  status: string;
  ownerName: string | null;
  raisedAt: string;
  rootCause: string | null;
  finalOutcome: string | null;
  isOpen: boolean;
}

export interface RecoveryPlanRow {
  id: string;
  status: string;
  trigger: string;
  objective: string;
  actions: string;
  ownerName: string | null;
  reviewDate: string | null;
  outcome: string | null;
  isLive: boolean;
}

const HEALTH_TONE: Record<string, "emerald" | "amber" | "rose" | "slate"> = {
  GREEN: "emerald",
  YELLOW: "amber",
  RED: "rose",
  NOT_ASSESSED: "slate",
};

const HEALTH_OPTIONS = [
  { value: "GREEN", label: "Green — healthy" },
  { value: "YELLOW", label: "Yellow — needs attention" },
  { value: "RED", label: "Red — at risk of leaving" },
];

const COMPLAINT_STATUSES = [
  "LOGGED",
  "INVESTIGATING",
  "ACTION_AGREED",
  "RESOLVED",
  "ESCALATED",
  "CLOSED",
];

const PLAN_STATUSES = ["DRAFT", "ACTIVE", "MONITORING", "SUCCEEDED", "FAILED", "CANCELLED"];

const areaClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

export function ClientHealth({
  clientId,
  canManage,
  currentStatus,
  daysSinceAssessment,
  assessments,
  complaints,
  plans,
  owners,
}: {
  clientId: string;
  canManage: boolean;
  currentStatus: string;
  daysSinceAssessment: number | null;
  assessments: AssessmentRow[];
  complaints: ComplaintRow[];
  plans: RecoveryPlanRow[];
  owners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"assess" | "complaint" | "plan" | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openComplaints = complaints.filter((item) => item.isOpen);
  const livePlan = plans.find((plan) => plan.isLive) ?? null;
  const editingPlan = plans.find((plan) => plan.id === editingPlanId) ?? null;

  function post(url: string, body: unknown, onDone?: () => void) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(url, {
        method: url.includes("/complaints/") ? "PATCH" : "POST",
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
          <CardTitle>Client health</CardTitle>
          <CardDescription>
            The colour is only as good as the reason behind it, so health moves by
            recording an assessment rather than picking from a list.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={HEALTH_TONE[currentStatus] ?? "slate"}>
            {formatEnumLabel(currentStatus)}
          </Badge>
          {openComplaints.length ? (
            <Badge tone="rose">{openComplaints.length} open complaint(s)</Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        ) : null}

        {currentStatus === "RED" && !livePlan ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
            <p className="text-sm leading-6 text-rose-900">
              This account is red with no active recovery plan. Write one — a red flag
              nobody is acting on reads as handled when nothing is happening.
            </p>
          </div>
        ) : null}

        {daysSinceAssessment !== null && daysSinceAssessment > 30 ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Last assessed {daysSinceAssessment} days ago. Health that old is a guess.
          </p>
        ) : null}

        {assessments.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            Nobody has assessed this account yet. Ongoing management cannot start
            without one.
          </p>
        ) : (
          <div className="space-y-2">
            {assessments.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">
                    <Badge tone={HEALTH_TONE[item.status] ?? "slate"}>
                      {formatEnumLabel(item.status)}
                    </Badge>
                    {item.healthScore !== null ? (
                      <span className="ml-2 font-normal text-slate-500">
                        score {item.healthScore}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    {formatDate(new Date(item.assessedAt))}
                  </p>
                </div>
                {item.summary ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>
                ) : null}
                <p className="mt-2 text-xs text-slate-400">
                  {item.assessedByName ?? "Unknown"}
                  {item.cancellationThreat ? " · cancellation threatened" : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        {complaints.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Complaints</p>
            {complaints.map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl border px-4 py-3 ${
                  item.isOpen ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <Badge tone={item.isOpen ? "rose" : "slate"}>
                    {formatEnumLabel(item.status)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.description}</p>
                {item.finalOutcome ? (
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">
                    Outcome: {item.finalOutcome}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-400">
                  Raised {formatDate(new Date(item.raisedAt))}
                  {item.ownerName ? ` · ${item.ownerName}` : ""}
                </p>

                {canManage && item.isOpen ? (
                  <form
                    action={(formData) =>
                      post(`/api/complaints/${item.id}`, {
                        status: String(formData.get("status") ?? ""),
                        finalOutcome: String(formData.get("finalOutcome") ?? "").trim(),
                      })
                    }
                    className="mt-3 flex flex-wrap items-end gap-2"
                  >
                    <label className="min-w-40 flex-1 space-y-1.5">
                      <span className="text-xs font-medium text-slate-600">Move to</span>
                      <Select name="status" defaultValue={item.status}>
                        {COMPLAINT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {formatEnumLabel(status)}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="min-w-52 flex-[2] space-y-1.5">
                      <span className="text-xs font-medium text-slate-600">
                        What was done (required to resolve or close)
                      </span>
                      <Input name="finalOutcome" defaultValue={item.finalOutcome ?? ""} />
                    </label>
                    <Button type="submit" size="sm" disabled={isPending}>
                      Update
                    </Button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {plans.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Recovery plans</p>
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl border px-4 py-3 ${
                  plan.isLive ? "border-sky-200 bg-sky-50/50" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">{plan.objective}</p>
                  <Badge tone={plan.isLive ? "sky" : "slate"}>
                    {formatEnumLabel(plan.status)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  Triggered by: {plan.trigger}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{plan.actions}</p>
                {plan.outcome ? (
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">
                    Outcome: {plan.outcome}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-400">
                  {plan.ownerName ?? "Unassigned"}
                  {plan.reviewDate ? ` · review ${formatDate(new Date(plan.reviewDate))}` : ""}
                </p>
                {canManage && plan.isLive ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    onClick={() => {
                      setEditingPlanId(plan.id);
                      setPanel("plan");
                    }}
                  >
                    Update plan
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {canManage && panel === "assess" ? (
          <form
            action={(formData) =>
              post(
                `/api/clients/${clientId}/health`,
                {
                  status: String(formData.get("status") ?? ""),
                  summary: String(formData.get("summary") ?? "").trim(),
                  healthScore: formData.get("healthScore")
                    ? Number(formData.get("healthScore"))
                    : null,
                  renewalProbability: formData.get("renewalProbability")
                    ? Number(formData.get("renewalProbability"))
                    : null,
                  cancellationThreat: formData.get("cancellationThreat") === "on",
                },
                () => setPanel(null),
              )
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Status</span>
                <Select name="status" defaultValue={currentStatus === "NOT_ASSESSED" ? "GREEN" : currentStatus}>
                  {HEALTH_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Health score 0–100</span>
                <Input type="number" name="healthScore" min={0} max={100} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">
                  Renewal likelihood 0–100
                </span>
                <Input type="number" name="renewalProbability" min={0} max={100} />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                Why is the account this colour?
              </span>
              <textarea name="summary" rows={3} required className={areaClass} />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="cancellationThreat" className="h-4 w-4" />
              The client has threatened to cancel
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Record assessment
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {canManage && panel === "complaint" ? (
          <form
            action={(formData) =>
              post(
                `/api/clients/${clientId}/complaints`,
                {
                  title: String(formData.get("title") ?? "").trim(),
                  description: String(formData.get("description") ?? "").trim(),
                  businessImpact: String(formData.get("businessImpact") ?? "").trim(),
                  ownerId: String(formData.get("ownerId") ?? ""),
                },
                () => setPanel(null),
              )
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">What is the complaint?</span>
                <Input name="title" required minLength={3} />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Who is handling it</span>
                <Select name="ownerId" defaultValue="">
                  <option value="">The account owner</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">What happened</span>
              <textarea name="description" rows={3} required className={areaClass} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                Impact on their business
              </span>
              <textarea name="businessImpact" rows={2} className={areaClass} />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                Record complaint
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPanel(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {canManage && panel === "plan" ? (
          <form
            action={(formData) =>
              post(
                `/api/clients/${clientId}/recovery-plans`,
                {
                  planId: editingPlan?.id ?? "",
                  trigger: String(formData.get("trigger") ?? "").trim(),
                  objective: String(formData.get("objective") ?? "").trim(),
                  actions: String(formData.get("actions") ?? "").trim(),
                  status: String(formData.get("status") ?? "ACTIVE"),
                  ownerId: String(formData.get("ownerId") ?? ""),
                  reviewDate: String(formData.get("reviewDate") ?? ""),
                  outcome: String(formData.get("outcome") ?? "").trim(),
                },
                () => {
                  setPanel(null);
                  setEditingPlanId(null);
                },
              )
            }
            className="space-y-3 rounded-2xl border border-slate-200 p-4"
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">What went wrong</span>
              <Input name="trigger" required defaultValue={editingPlan?.trigger ?? ""} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">What good looks like</span>
              <Input name="objective" required defaultValue={editingPlan?.objective ?? ""} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">What we are going to do</span>
              <textarea
                name="actions"
                rows={3}
                required
                className={areaClass}
                defaultValue={editingPlan?.actions ?? ""}
              />
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Status</span>
                <Select name="status" defaultValue={editingPlan?.status ?? "ACTIVE"}>
                  {PLAN_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {formatEnumLabel(status)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Owner</span>
                <Select name="ownerId" defaultValue="">
                  <option value="">The account owner</option>
                  {owners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Review on</span>
                <Input
                  type="date"
                  name="reviewDate"
                  defaultValue={editingPlan?.reviewDate?.slice(0, 10) ?? ""}
                />
              </label>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-600">
                Outcome (required to close the plan)
              </span>
              <textarea
                name="outcome"
                rows={2}
                className={areaClass}
                defaultValue={editingPlan?.outcome ?? ""}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                {editingPlan ? "Update plan" : "Start recovery plan"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPanel(null);
                  setEditingPlanId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {canManage && panel === null ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setPanel("assess")} className="gap-2">
              <HeartPulse className="h-4 w-4" />
              Record an assessment
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setPanel("complaint")}
            >
              Record a complaint
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => {
                setEditingPlanId(null);
                setPanel("plan");
              }}
            >
              <Activity className="h-4 w-4" />
              Start a recovery plan
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
