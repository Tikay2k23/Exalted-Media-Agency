"use client";

import { CheckCircle2, LoaderCircle, ShieldAlert, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";

export interface ApprovalRow {
  id: string;
  type: string;
  typeLabel: string;
  subject: string;
  status: string;
  approvedByName: string | null;
  approvedAt: string;
  evidenceUrl: string | null;
  notes: string | null;
  recordedByName: string | null;
  projectName: string | null;
  withdrawnReason: string | null;
  withdrawnByName: string | null;
  /** Whether a launch may rest on this one. Derived server-side. */
  countsForLaunch: boolean;
  shortfall: string[];
}

export interface ApproverOption {
  id: string;
  name: string;
  role: string | null;
}

const areaClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

export function ClientApprovals({
  clientId,
  canRecord,
  approvals,
  approvers,
  contactCount,
  approvalTypes,
  projects,
}: {
  clientId: string;
  canRecord: boolean;
  approvals: ApprovalRow[];
  approvers: ApproverOption[];
  contactCount: number;
  approvalTypes: { value: string; label: string }[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const live = approvals.filter((approval) => approval.countsForLaunch);
  const today = new Date().toISOString().slice(0, 10);

  function record(formData: FormData) {
    setError(null);

    const payload = {
      type: String(formData.get("type") ?? ""),
      subject: String(formData.get("subject") ?? "").trim(),
      approverContactId: String(formData.get("approverContactId") ?? ""),
      approvedAt: String(formData.get("approvedAt") ?? ""),
      evidenceUrl: String(formData.get("evidenceUrl") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
      projectId: String(formData.get("projectId") ?? ""),
    };

    startTransition(async () => {
      const response = await fetch(`/api/clients/${clientId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't record that approval.");
        return;
      }

      setAdding(false);
      router.refresh();
    });
  }

  function withdraw(approvalId: string, reason: string) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/approvals/${approvalId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't withdraw that approval.");
        return;
      }

      setWithdrawingId(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Client approvals</CardTitle>
          <CardDescription>
            What the client has signed off, who signed it, and the evidence. An account
            cannot reach Ready for launch without one on file.
          </CardDescription>
        </div>
        <Badge tone={live.length ? "emerald" : "amber"}>
          {live.length ? `${live.length} in force` : "None on file"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm text-rose-700">{error}</p>
          </div>
        ) : null}

        {approvers.length === 0 ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p className="text-sm leading-6 text-amber-900">
              {contactCount === 0
                ? "No contacts on this account yet. Add the client's contacts above, and mark whoever is allowed to approve work."
                : "Nobody on this account is marked as authorized to approve. Edit the right contact above and tick “Authorized approver” - approvals can only be attributed to someone who is."}
            </p>
          </div>
        ) : null}

        {approvals.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            Nothing recorded yet. When the client approves something - by email, on a
            call, or in writing - record it here so the sign-off survives the
            conversation.
          </p>
        ) : (
          <ul className="space-y-3">
            {approvals.map((approval) => (
              <li
                key={approval.id}
                className={`rounded-2xl border px-4 py-3 ${
                  approval.status === "WITHDRAWN"
                    ? "border-slate-200 bg-slate-50"
                    : approval.countsForLaunch
                      ? "border-emerald-200 bg-emerald-50/50"
                      : "border-amber-200 bg-amber-50/50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={`font-semibold text-slate-900 ${
                        approval.status === "WITHDRAWN" ? "line-through decoration-slate-400" : ""
                      }`}
                    >
                      {approval.subject}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {approval.typeLabel}
                      {approval.projectName ? ` · ${approval.projectName}` : ""}
                      {" · "}
                      approved by {approval.approvedByName ?? "nobody named"} on{" "}
                      {formatDate(new Date(approval.approvedAt))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {approval.status === "WITHDRAWN" ? (
                      <Badge tone="slate">Withdrawn</Badge>
                    ) : approval.countsForLaunch ? (
                      <Badge tone="emerald">Counts for launch</Badge>
                    ) : (
                      <Badge tone="amber">Not usable</Badge>
                    )}
                  </div>
                </div>

                {approval.evidenceUrl ? (
                  <p className="mt-2 truncate text-sm">
                    <a
                      href={approval.evidenceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-sky-700 underline underline-offset-2"
                    >
                      {approval.evidenceUrl}
                    </a>
                  </p>
                ) : null}

                {approval.notes ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">{approval.notes}</p>
                ) : null}

                {approval.status !== "WITHDRAWN" && approval.shortfall.length > 0 ? (
                  <p className="mt-2 text-sm leading-6 text-amber-800">
                    A launch cannot rest on this because {approval.shortfall.join(", ")}.
                  </p>
                ) : null}

                {approval.status === "WITHDRAWN" ? (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Withdrawn{approval.withdrawnByName ? ` by ${approval.withdrawnByName}` : ""}:{" "}
                    {approval.withdrawnReason}
                  </p>
                ) : null}

                <p className="mt-2 text-xs text-slate-400">
                  Recorded by {approval.recordedByName ?? "an unknown teammate"}
                </p>

                {canRecord && approval.status !== "WITHDRAWN" ? (
                  withdrawingId === approval.id ? (
                    <form
                      action={(formData) =>
                        withdraw(approval.id, String(formData.get("reason") ?? "").trim())
                      }
                      className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-600">
                          Why does this approval no longer stand?
                        </span>
                        <Input
                          name="reason"
                          required
                          minLength={10}
                          placeholder="Client retracted it on the 6 Aug call - wants the pricing section changed"
                        />
                      </label>
                      <p className="text-sm leading-6 text-slate-500">
                        The record is kept either way. Withdrawing stops it counting towards
                        launch.
                      </p>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={isPending}>
                          Withdraw it
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setWithdrawingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="mt-3 gap-2"
                      onClick={() => setWithdrawingId(approval.id)}
                    >
                      <Undo2 className="h-4 w-4" />
                      Withdraw
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canRecord ? (
          adding ? (
            <form action={record} className="space-y-4 rounded-2xl border border-slate-200 p-4">
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">What was approved</span>
                  <Input
                    name="subject"
                    required
                    minLength={2}
                    placeholder="Homepage and booking funnel, round 2"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Type</span>
                  <Select name="type" defaultValue={approvalTypes[0]?.value}>
                    {approvalTypes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">
                    Who approved it
                  </span>
                  <Select name="approverContactId" required>
                    {approvers.map((approver) => (
                      <option key={approver.id} value={approver.id}>
                        {approver.name}
                        {approver.role ? ` (${approver.role})` : ""}
                      </option>
                    ))}
                  </Select>
                  <span className="block text-xs leading-5 text-slate-500">
                    Only contacts marked as authorized approvers appear here.
                  </span>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">
                    When they approved it
                  </span>
                  <Input type="date" name="approvedAt" max={today} defaultValue={today} />
                </label>

                {projects.length ? (
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-600">
                      Project (optional)
                    </span>
                    <Select name="projectId" defaultValue="">
                      <option value="">Not project specific</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}

                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">
                    Link to the approval
                  </span>
                  <Input
                    name="evidenceUrl"
                    placeholder="Email thread, recording, or signed document"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-600">
                  Or describe how it was given
                </span>
                <textarea
                  name="notes"
                  rows={2}
                  className={areaClass}
                  placeholder="Approved verbally on a call with Maria on 6 Aug; summary emailed to her the same day."
                />
                <span className="block text-xs leading-5 text-slate-500">
                  One of these two is required. Without either, nobody can check the
                  sign-off later.
                </span>
              </label>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={isPending} className="gap-2">
                  {isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Record approval
                </Button>
                <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={approvers.length === 0}
              onClick={() => setAdding(true)}
            >
              Record a client approval
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
