"use client";

import { AlertTriangle, BookOpen, CheckCircle2, LoaderCircle, ShieldAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDate, formatEnumLabel } from "@/lib/utils";

export interface SopRow {
  id: string;
  reference: string;
  title: string;
  status: string;
  currentVersion: string;
  versionCount: number;
  ownerName: string | null;
  approvedByName: string | null;
  latestAuthorId: string | null;
  nextReviewAt: string | null;
  reviewOverdue: boolean;
}

export interface FindingRow {
  id: string;
  title: string;
  detail: string;
  result: string;
  isCritical: boolean;
  actionCount: number;
}

export interface AuditRow {
  id: string;
  reference: string;
  type: string;
  status: string;
  scope: string;
  auditorName: string | null;
  clientName: string | null;
  complianceScore: number | null;
  findings: FindingRow[];
  unresolvedCritical: string[];
}

export interface ActionRow {
  id: string;
  title: string;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  verifiedByName: string | null;
  rootCause: string | null;
  dueDate: string | null;
  findingTitle: string | null;
  isOpen: boolean;
  isOverdue: boolean;
}

export interface ImprovementRow {
  id: string;
  title: string;
  problem: string;
  priority: string;
  status: string;
  ownerName: string | null;
  raisedByName: string | null;
  result: string | null;
}

export interface CertificationRow {
  userId: string;
  userName: string;
  teamRole: string;
  state: "none" | "current" | "expiring" | "expired";
  records: {
    id: string;
    courseName: string;
    status: string;
    certification: string | null;
    expiresAt: string | null;
  }[];
}

const STATE_TONE: Record<string, "slate" | "emerald" | "amber" | "rose"> = {
  none: "slate",
  current: "emerald",
  expiring: "amber",
  expired: "rose",
};

const STATE_LABEL: Record<string, string> = {
  none: "Not certified yet",
  current: "Current",
  expiring: "Expiring soon",
  expired: "Expired",
};

const areaClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

export function GovernanceWorkspace({
  currentUserId,
  canManageSops,
  canAudit,
  canCorrect,
  canTrain,
  sops,
  audits,
  actions,
  improvements,
  certifications,
  team,
  auditTypes,
  complianceResults,
  improvementPriorities,
  certificationLevels,
}: {
  currentUserId: string;
  canManageSops: boolean;
  canAudit: boolean;
  canCorrect: boolean;
  canTrain: boolean;
  sops: SopRow[];
  audits: AuditRow[];
  actions: ActionRow[];
  improvements: ImprovementRow[];
  certifications: CertificationRow[];
  team: { id: string; name: string }[];
  auditTypes: { value: string; label: string }[];
  complianceResults: { value: string; label: string }[];
  improvementPriorities: { value: string; label: string }[];
  certificationLevels: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [outstanding, setOutstanding] = useState<string[]>([]);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const overdueSops = sops.filter((sop) => sop.reviewOverdue);
  const openActions = actions.filter((action) => action.isOpen);
  const overdueActions = actions.filter((action) => action.isOverdue);
  const lapsed = certifications.filter((item) => item.state === "expired");

  function post(url: string, body: unknown, onDone?: () => void) {
    setError(null);
    setOutstanding([]);

    startTransition(async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string; outstanding?: string[] }
          | null;
        setError(data?.error ?? "That could not be saved.");
        setOutstanding(data?.outstanding ?? []);
        return;
      }

      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm leading-6 text-rose-700">{error}</p>
          {outstanding.length ? (
            <ul className="mt-1.5 space-y-0.5">
              {outstanding.map((item) => (
                <li key={item} className="text-sm leading-6 text-rose-700">
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* --- SOP library --- */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>SOP library</CardTitle>
            <CardDescription>
              Every version is kept, so an audit can be judged against the rules that
              applied at the time rather than the document as it reads today.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {overdueSops.length ? (
              <Badge tone="amber">{overdueSops.length} due for review</Badge>
            ) : null}
            <Badge tone="slate">{sops.length} procedures</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {sops.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              The library is empty. Run <code>node scripts/load-sops.mjs</code> to import
              the documents in docs/sop.
            </p>
          ) : (
            <ul className="space-y-2">
              {sops.map((sop) => {
                const isAuthor = sop.latestAuthorId === currentUserId;

                return (
                  <li
                    key={sop.id}
                    className={`rounded-2xl border px-4 py-3 ${
                      sop.status === "ACTIVE"
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {sop.reference} — {sop.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Version {sop.currentVersion} of {sop.versionCount}
                          {sop.ownerName ? ` · owned by ${sop.ownerName}` : ""}
                          {sop.approvedByName ? ` · approved by ${sop.approvedByName}` : ""}
                        </p>
                        {sop.reviewOverdue ? (
                          <p className="mt-1.5 text-sm leading-6 text-amber-800">
                            Overdue for review. Nobody can say it is still right.
                          </p>
                        ) : null}
                      </div>
                      <Badge tone={sop.status === "ACTIVE" ? "emerald" : "slate"}>
                        {formatEnumLabel(sop.status)}
                      </Badge>
                    </div>

                    {canManageSops ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {sop.status !== "ACTIVE" ? (
                          isAuthor ? (
                            <span className="inline-flex items-start gap-2 text-sm leading-6 text-amber-800">
                              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                              You wrote this version, so somebody else approves it.
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              disabled={isPending}
                              onClick={() =>
                                post(`/api/governance/sops/${sop.id}`, { action: "activate" })
                              }
                            >
                              Approve and activate
                            </Button>
                          )
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isPending}
                            onClick={() =>
                              post(`/api/governance/sops/${sop.id}`, { action: "review" })
                            }
                          >
                            Reviewed, still current
                          </Button>
                        )}
                        {sop.nextReviewAt ? (
                          <span className="text-xs text-slate-400">
                            Next review {formatDate(new Date(sop.nextReviewAt))}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* --- Audits --- */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Audits</CardTitle>
            <CardDescription>
              An audit cannot be closed while a critical finding has nothing being done
              about it.
            </CardDescription>
          </div>
          {canAudit ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setOpenForm(openForm === "audit" ? null : "audit")}
            >
              Start an audit
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {canAudit && openForm === "audit" ? (
            <form
              action={(formData) =>
                post(
                  "/api/governance/audits",
                  {
                    type: String(formData.get("type") ?? ""),
                    scope: String(formData.get("scope") ?? "").trim(),
                    summary: String(formData.get("summary") ?? "").trim(),
                  },
                  () => setOpenForm(null),
                )
              }
              className="space-y-3 rounded-2xl border border-slate-200 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Type</span>
                  <Select name="type" defaultValue={auditTypes[0]?.value}>
                    {auditTypes.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">What it covers</span>
                  <Input name="scope" required placeholder="Onboarding for accounts started in July" />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Notes</span>
                <textarea name="summary" rows={2} className={areaClass} />
              </label>
              <Button type="submit" size="sm" disabled={isPending} className="gap-2">
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Start audit
              </Button>
            </form>
          ) : null}

          {audits.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              No audits yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {audits.map((audit) => (
                <li key={audit.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        {audit.reference} — {audit.scope}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {formatEnumLabel(audit.type)}
                        {audit.auditorName ? ` · ${audit.auditorName}` : ""}
                        {audit.clientName ? ` · ${audit.clientName}` : ""}
                        {audit.complianceScore !== null ? ` · ${audit.complianceScore}/100` : ""}
                      </p>
                    </div>
                    <Badge tone={audit.status === "COMPLETE" ? "emerald" : "amber"}>
                      {formatEnumLabel(audit.status)}
                    </Badge>
                  </div>

                  {audit.findings.length ? (
                    <ul className="mt-2 space-y-1.5">
                      {audit.findings.map((finding) => (
                        <li
                          key={finding.id}
                          className="flex items-start gap-2 text-sm leading-6 text-slate-600"
                        >
                          {finding.isCritical ? (
                            <AlertTriangle
                              className="mt-1 h-3.5 w-3.5 shrink-0 text-rose-600"
                              aria-hidden
                            />
                          ) : (
                            <CheckCircle2
                              className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300"
                              aria-hidden
                            />
                          )}
                          <span>
                            {finding.title} — {formatEnumLabel(finding.result)}
                            {finding.actionCount === 0 && finding.isCritical
                              ? " · no corrective action yet"
                              : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {audit.unresolvedCritical.length ? (
                    <p className="mt-2 text-sm leading-6 text-rose-800">
                      Cannot be closed: {audit.unresolvedCritical.join(", ")} still has no
                      corrective action.
                    </p>
                  ) : null}

                  {canAudit && audit.status !== "COMPLETE" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setOpenForm(openForm === `finding-${audit.id}` ? null : `finding-${audit.id}`)
                        }
                      >
                        Record a finding
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isPending || audit.unresolvedCritical.length > 0}
                        onClick={() => post(`/api/governance/audits/${audit.id}/complete`, {})}
                      >
                        Close audit
                      </Button>
                    </div>
                  ) : null}

                  {openForm === `finding-${audit.id}` ? (
                    <form
                      action={(formData) =>
                        post(
                          `/api/governance/audits/${audit.id}/findings`,
                          {
                            title: String(formData.get("title") ?? "").trim(),
                            detail: String(formData.get("detail") ?? "").trim(),
                            result: String(formData.get("result") ?? ""),
                            isCritical: formData.get("isCritical") === "on",
                          },
                          () => setOpenForm(null),
                        )
                      }
                      className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3"
                    >
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-600">Finding</span>
                        <Input name="title" required />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-600">
                          What was actually found
                        </span>
                        <textarea name="detail" rows={2} required className={areaClass} />
                      </label>
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-slate-600">Result</span>
                        <Select name="result" defaultValue="NON_COMPLIANT">
                          {complianceResults.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" name="isCritical" className="h-4 w-4" />
                        Critical — needs a corrective action before this audit can close
                      </label>
                      <Button type="submit" size="sm" disabled={isPending}>
                        Record finding
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* --- Corrective actions --- */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Corrective actions</CardTitle>
            <CardDescription>
              The owner cannot verify their own. Closing one needs the root cause written
              down, or the same finding comes back next audit.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {overdueActions.length ? <Badge tone="rose">{overdueActions.length} overdue</Badge> : null}
            <Badge tone="slate">{openActions.length} open</Badge>
            {canCorrect ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setOpenForm(openForm === "action" ? null : "action")}
              >
                Raise one
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {canCorrect && openForm === "action" ? (
            <form
              action={(formData) =>
                post(
                  "/api/governance/corrective-actions",
                  {
                    title: String(formData.get("title") ?? "").trim(),
                    risk: String(formData.get("risk") ?? "").trim(),
                    immediateCorrection: String(formData.get("immediateCorrection") ?? "").trim(),
                    rootCause: String(formData.get("rootCause") ?? "").trim(),
                    processCorrection: String(formData.get("processCorrection") ?? "").trim(),
                    ownerId: String(formData.get("ownerId") ?? ""),
                    dueDate: String(formData.get("dueDate") ?? ""),
                  },
                  () => setOpenForm(null),
                )
              }
              className="space-y-3 rounded-2xl border border-slate-200 p-4"
            >
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-600">What is being corrected</span>
                <Input name="title" required />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Owner</span>
                  <Select name="ownerId" defaultValue="">
                    <option value="">Me</option>
                    {team.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Due</span>
                  <Input type="date" name="dueDate" />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Immediate correction</span>
                <textarea name="immediateCorrection" rows={2} className={areaClass} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-600">
                  Root cause (required before it can be closed)
                </span>
                <textarea name="rootCause" rows={2} className={areaClass} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-600">
                  Process change so it does not recur
                </span>
                <textarea name="processCorrection" rows={2} className={areaClass} />
              </label>
              <Button type="submit" size="sm" disabled={isPending}>
                Raise corrective action
              </Button>
            </form>
          ) : null}

          {actions.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              Nothing outstanding.
            </p>
          ) : (
            <ul className="space-y-2">
              {actions.map((action) => (
                <li
                  key={action.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    action.isOverdue
                      ? "border-rose-200 bg-rose-50/50"
                      : action.isOpen
                        ? "border-slate-200 bg-white"
                        : "border-emerald-200 bg-emerald-50/40"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{action.title}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {action.ownerName ?? "Unassigned"}
                        {action.dueDate ? ` · due ${formatDate(new Date(action.dueDate))}` : ""}
                        {action.findingTitle ? ` · from "${action.findingTitle}"` : ""}
                      </p>
                      {!action.rootCause && action.isOpen ? (
                        <p className="mt-1.5 text-sm leading-6 text-amber-800">
                          No root cause recorded yet.
                        </p>
                      ) : null}
                      {action.verifiedByName ? (
                        <p className="mt-1.5 text-sm text-slate-500">
                          Verified by {action.verifiedByName}
                        </p>
                      ) : null}
                    </div>
                    <Badge tone={action.isOverdue ? "rose" : action.isOpen ? "amber" : "emerald"}>
                      {formatEnumLabel(action.status)}
                    </Badge>
                  </div>

                  {canCorrect && action.isOpen ? (
                    action.ownerId === currentUserId ? (
                      <p className="mt-3 inline-flex items-start gap-2 text-sm leading-6 text-amber-800">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        You own this, so somebody else verifies it.
                      </p>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3"
                        disabled={isPending}
                        onClick={() =>
                          post(`/api/governance/corrective-actions/${action.id}/verify`, {})
                        }
                      >
                        Verify and close
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* --- Improvement backlog --- */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Improvement backlog</CardTitle>
            <CardDescription>
              Anyone who can see governance can propose. Accepting or rejecting is the
              oversight call.
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setOpenForm(openForm === "improvement" ? null : "improvement")}
          >
            Propose one
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {openForm === "improvement" ? (
            <form
              action={(formData) =>
                post(
                  "/api/governance/improvements",
                  {
                    title: String(formData.get("title") ?? "").trim(),
                    problem: String(formData.get("problem") ?? "").trim(),
                    source: String(formData.get("source") ?? "").trim(),
                    proposedSolution: String(formData.get("proposedSolution") ?? "").trim(),
                    priority: String(formData.get("priority") ?? "PRIORITY_THREE"),
                  },
                  () => setOpenForm(null),
                )
              }
              className="space-y-3 rounded-2xl border border-slate-200 p-4"
            >
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Title</span>
                <Input name="title" required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-600">
                  What is the problem? Not what to build.
                </span>
                <textarea name="problem" rows={2} required className={areaClass} />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">
                    Where it came from
                  </span>
                  <Input name="source" placeholder="Audit, client feedback, a defect" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Priority</span>
                  <Select name="priority" defaultValue="PRIORITY_THREE">
                    {improvementPriorities.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-600">Proposed change</span>
                <textarea name="proposedSolution" rows={2} className={areaClass} />
              </label>
              <Button type="submit" size="sm" disabled={isPending}>
                Propose
              </Button>
            </form>
          ) : null}

          {improvements.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              Nothing proposed yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {improvements.map((item) => (
                <li key={item.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.problem}</p>
                      <p className="mt-1.5 text-xs text-slate-400">
                        {formatEnumLabel(item.priority)}
                        {item.raisedByName ? ` · raised by ${item.raisedByName}` : ""}
                      </p>
                    </div>
                    <Badge tone={item.status === "IMPLEMENTED" ? "emerald" : "slate"}>
                      {formatEnumLabel(item.status)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* --- Certification --- */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Training and certification</CardTitle>
            <CardDescription>
              A lapsed certification blocks restricted high-risk work, which today means
              activating a launch. Somebody never certified is not blocked — the rule
              arms itself when their first record is added.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {lapsed.length ? <Badge tone="rose">{lapsed.length} lapsed</Badge> : null}
            {canTrain ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setOpenForm(openForm === "training" ? null : "training")}
              >
                Record training
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {canTrain && openForm === "training" ? (
            <form
              action={(formData) =>
                post(
                  "/api/governance/training",
                  {
                    userId: String(formData.get("userId") ?? ""),
                    courseName: String(formData.get("courseName") ?? "").trim(),
                    sopReference: String(formData.get("sopReference") ?? "").trim(),
                    status: String(formData.get("status") ?? "ASSIGNED"),
                    certificationAwarded: String(formData.get("certificationAwarded") ?? "") || null,
                    certificationExpiresAt: String(formData.get("certificationExpiresAt") ?? ""),
                  },
                  () => setOpenForm(null),
                )
              }
              className="space-y-3 rounded-2xl border border-slate-200 p-4"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Who</span>
                  <Select name="userId" required defaultValue="">
                    <option value="" disabled>
                      Choose a teammate
                    </option>
                    {team.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Course</span>
                  <Input name="courseName" required placeholder="Launch procedure" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Covers SOP</span>
                  <Input name="sopReference" placeholder="SOP-07" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Status</span>
                  <Select name="status" defaultValue="ASSIGNED">
                    {["ASSIGNED", "IN_PROGRESS", "COMPLETED", "WAIVED"].map((status) => (
                      <option key={status} value={status}>
                        {formatEnumLabel(status)}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Certification</span>
                  <Select name="certificationAwarded" defaultValue="">
                    <option value="">None yet</option>
                    {certificationLevels.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-slate-600">Expires</span>
                  <Input type="date" name="certificationExpiresAt" />
                </label>
              </div>
              <Button type="submit" size="sm" disabled={isPending}>
                Save record
              </Button>
            </form>
          ) : null}

          <ul className="space-y-2">
            {certifications.map((person) => (
              <li
                key={person.userId}
                className={`rounded-2xl border px-4 py-3 ${
                  person.state === "expired"
                    ? "border-rose-200 bg-rose-50/50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{person.userName}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatEnumLabel(person.teamRole)}
                    </p>
                    {person.records.length ? (
                      <ul className="mt-1.5 space-y-0.5">
                        {person.records.map((record) => (
                          <li key={record.id} className="text-sm leading-6 text-slate-600">
                            {record.courseName}
                            {record.certification
                              ? ` · ${formatEnumLabel(record.certification)}`
                              : ""}
                            {record.expiresAt
                              ? ` · expires ${formatDate(new Date(record.expiresAt))}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <Badge tone={STATE_TONE[person.state]}>{STATE_LABEL[person.state]}</Badge>
                </div>
                {person.state === "expired" ? (
                  <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-rose-800">
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    Cannot activate a launch until this is renewed.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
