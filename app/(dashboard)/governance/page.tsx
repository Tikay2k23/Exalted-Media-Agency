import { notFound } from "next/navigation";

import { GovernanceWorkspace } from "@/components/governance/governance-workspace";
import { loadAuthContext } from "@/lib/authz";
import { getGovernanceOverview } from "@/lib/data/governance-queries";
import {
  AUDIT_TYPES,
  COMPLIANCE_RESULTS,
  IMPROVEMENT_PRIORITIES,
  isCorrectiveActionOpen,
  isCorrectiveActionOverdue,
  unresolvedCriticalFindings,
} from "@/lib/governance/audit-service";
import { isSopReviewOverdue } from "@/lib/governance/sop-service";
import {
  CERTIFICATION_LEVELS,
  certificationState,
} from "@/lib/governance/training-service";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GovernancePage() {
  const user = await requireUser();
  const actor = await loadAuthContext(user.id);

  if (!actor) {
    notFound();
  }

  // The sidebar hides this link without the permission, but a link is not a
  // lock: the page checks for itself.
  if (!can(actor, "governance.view")) {
    notFound();
  }

  const data = await getGovernanceOverview();

  const certifications = data.team.map((member) => {
    const records = data.training.filter((record) => record.userId === member.id);

    return {
      userId: member.id,
      userName: member.name,
      teamRole: member.teamRole,
      state: certificationState(records),
      records: records.map((record) => ({
        id: record.id,
        courseName: record.courseName,
        status: record.status,
        certification: record.certificationAwarded,
        expiresAt: record.certificationExpiresAt?.toISOString() ?? null,
      })),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.32em] text-sky-600">Governance</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Procedures, audits and improvement
        </h1>
        <p className="mt-2 max-w-3xl leading-7 text-slate-600">
          The rules the agency runs on, whether they are being followed, and what is
          being done about it when they are not.
        </p>
      </div>

      <GovernanceWorkspace
        currentUserId={actor.id}
        canManageSops={can(actor, "sop.manage")}
        canAudit={can(actor, "governance.audit")}
        canCorrect={can(actor, "governance.correctiveAction")}
        canTrain={can(actor, "team.training")}
        team={data.team.map((member) => ({ id: member.id, name: member.name }))}
        auditTypes={AUDIT_TYPES.map((o) => ({ value: o.value, label: o.label }))}
        complianceResults={COMPLIANCE_RESULTS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        improvementPriorities={IMPROVEMENT_PRIORITIES.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        certificationLevels={CERTIFICATION_LEVELS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
        certifications={certifications}
        sops={data.sops.map((sop) => ({
          id: sop.id,
          reference: sop.reference,
          title: sop.title,
          status: sop.status,
          currentVersion: sop.currentVersion,
          versionCount: sop._count.versions,
          ownerName: sop.owner?.name ?? null,
          approvedByName: sop.approvedBy?.name ?? null,
          latestAuthorId: sop.versions[0]?.authorId ?? null,
          nextReviewAt: sop.nextReviewAt?.toISOString() ?? null,
          reviewOverdue: isSopReviewOverdue(sop),
        }))}
        audits={data.audits.map((audit) => ({
          id: audit.id,
          reference: audit.reference,
          type: audit.type,
          status: audit.status,
          scope: audit.scope,
          auditorName: audit.auditor?.name ?? null,
          clientName: audit.client?.companyName ?? null,
          complianceScore: audit.complianceScore,
          findings: audit.findings.map((finding) => ({
            id: finding.id,
            title: finding.title,
            detail: finding.detail,
            result: finding.result,
            isCritical: finding.isCritical,
            actionCount: finding.correctiveActions.length,
          })),
          unresolvedCritical: unresolvedCriticalFindings(audit.findings).map(
            (finding) => finding.title,
          ),
        }))}
        actions={data.correctiveActions.map((action) => ({
          id: action.id,
          title: action.title,
          status: action.status,
          ownerId: action.ownerId,
          ownerName: action.owner?.name ?? null,
          verifiedByName: action.verifiedBy?.name ?? null,
          rootCause: action.rootCause,
          dueDate: action.dueDate?.toISOString() ?? null,
          findingTitle: action.finding?.title ?? null,
          isOpen: isCorrectiveActionOpen(action.status),
          isOverdue: isCorrectiveActionOverdue(action),
        }))}
        improvements={data.improvements.map((item) => ({
          id: item.id,
          title: item.title,
          problem: item.problem,
          priority: item.priority,
          status: item.status,
          ownerName: item.owner?.name ?? null,
          raisedByName: item.raisedBy?.name ?? null,
          result: item.result,
        }))}
      />
    </div>
  );
}
