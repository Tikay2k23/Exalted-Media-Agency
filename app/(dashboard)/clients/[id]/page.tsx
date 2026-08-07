import { notFound } from "next/navigation";

import { AccountDetailsForm } from "@/components/clients/account-details-form";
import { ClientAccess } from "@/components/clients/client-access";
import { ClientApprovals } from "@/components/clients/client-approvals";
import { ClientBrief } from "@/components/clients/client-brief";
import { ClientContacts } from "@/components/clients/client-contacts";
import { ClientHealth } from "@/components/clients/client-health";
import { ClientForm } from "@/components/clients/client-form";
import { ClientInvoices } from "@/components/clients/client-invoices";
import { ClientLaunches } from "@/components/clients/client-launches";
import { ClientProjects } from "@/components/clients/client-projects";
import { ClientQuality } from "@/components/clients/client-quality";
import { DeleteClientButton } from "@/components/clients/delete-client-button";
import { ClientStatusSelect } from "@/components/clients/client-status-select";
import { StageReadiness } from "@/components/clients/stage-readiness";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getClientDetail,
  getSharedOptions,
  serviceTypeOptions,
} from "@/lib/data/queries";
import { loadAuthContext } from "@/lib/authz";
import { deriveProjectProgress } from "@/lib/delivery/project-service";
import { deriveLaunchReadiness } from "@/lib/launch/launch-service";
import {
  CLIENT_APPROVAL_TYPES,
  describeApprovalShortfall,
  isVerifiableApproval,
} from "@/lib/approvals/approval-service";
import { isDefectOpen } from "@/lib/quality/defect-service";
import {
  daysSinceAssessment,
  isComplaintOpen,
  isRecoveryPlanLive,
} from "@/lib/success/health-service";
import { deriveBriefCompleteness } from "@/lib/strategy/brief-service";
import { can, canAccessAssignedRecord, canManageClients } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatDate, formatDateTime, formatEnumLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A date input needs YYYY-MM-DD, not an ISO timestamp. */
function toDateInput(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toneForStatus(status: string): "sky" | "amber" | "rose" | "emerald" {
  switch (status) {
    case "AT_RISK":
      return "rose";
    case "ON_HOLD":
      return "amber";
    case "COMPLETED":
      return "emerald";
    default:
      return "sky";
  }
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const [client, options] = await Promise.all([
    getClientDetail(user, id),
    getSharedOptions(),
  ]);

  if (!client) {
    notFound();
  }

  const actor = await loadAuthContext(user.id);

  if (!actor) {
    notFound();
  }

  const canManageClient = canManageClients(user.role);
  const canViewFinance = can(actor, "finance.view");
  const canEditFinance = can(actor, "finance.edit");
  const canEditStatus =
    canManageClient ||
    canAccessAssignedRecord(user.role, user.id, client.assignedUserId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-sky-600">Client profile</p>
            <CardTitle className="mt-3 text-3xl">{client.companyName}</CardTitle>
            <CardDescription className="mt-2 text-base">
              Primary contact: {client.clientName} / {client.contactEmail}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="violet">{client.currentStage.name}</Badge>
            <Badge tone="sky">{formatEnumLabel(client.serviceType)}</Badge>
            <Badge tone={toneForStatus(client.status)}>{formatEnumLabel(client.status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Assigned teammate</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {client.assignedUser?.name ?? "Unassigned"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Date added</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {formatDate(client.dateAdded)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Contact phone</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">
              {client.contactPhone ?? "Not provided"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Open work items</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{client.openTaskCount}</p>
            <p className="mt-1 text-sm text-slate-500">{client.overdueTaskCount} overdue</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Client status</p>
            <div className="mt-2">
              <ClientStatusSelect clientId={client.id} value={client.status} disabled={!canEditStatus} />
            </div>
          </div>
        </CardContent>
      </Card>

      <StageReadiness
        clientId={client.id}
        currentStagePosition={client.currentStage.position}
      />

      <section className="grid items-start gap-6 xl:grid-cols-2">
        <AccountDetailsForm
          clientId={client.id}
          canEdit={canManageClient}
          users={options.users}
          values={{
            assignedUserId: client.assignedUserId,
            monthlyValue: client.monthlyValue === null ? null : Number(client.monthlyValue),
            contractStartDate: toDateInput(client.contractStartDate),
            contractEndDate: toDateInput(client.contractEndDate),
            renewalDate: toDateInput(client.renewalDate),
            currentBlocker: client.currentBlocker,
            nextAction: client.nextAction,
            nextActionDueAt: toDateInput(client.nextActionDueAt),
          }}
        />

        <ClientContacts
          clientId={client.id}
          canEdit={canManageClient}
          contacts={client.contacts}
        />
      </section>

      <ClientHealth
        clientId={client.id}
        canManage={can(actor, "health.manage")}
        currentStatus={client.healthStatus}
        daysSinceAssessment={daysSinceAssessment(
          client.healthAssessments[0]?.assessedAt ?? null,
        )}
        owners={options.users}
        assessments={client.healthAssessments.map((item) => ({
          id: item.id,
          status: item.status,
          summary: item.summary,
          healthScore: item.healthScore,
          assessedByName: item.assessedBy?.name ?? null,
          assessedAt: item.assessedAt.toISOString(),
          openComplaints: item.openComplaints,
          cancellationThreat: item.cancellationThreat,
        }))}
        complaints={client.complaints.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          status: item.status,
          ownerName: item.owner?.name ?? null,
          raisedAt: item.raisedAt.toISOString(),
          rootCause: item.rootCause,
          finalOutcome: item.finalOutcome,
          isOpen: isComplaintOpen(item.status),
        }))}
        plans={client.recoveryPlans.map((plan) => ({
          id: plan.id,
          status: plan.status,
          trigger: plan.trigger,
          objective: plan.objective,
          actions: plan.actions,
          ownerName: plan.owner?.name ?? null,
          reviewDate: plan.reviewDate?.toISOString() ?? null,
          outcome: plan.outcome,
          isLive: isRecoveryPlanLive(plan.status),
        }))}
      />

      <ClientBrief
        clientId={client.id}
        currentUserId={actor.id}
        canEdit={can(actor, "projects.manage")}
        brief={{
          exists: client.strategyBrief !== null,
          status: client.strategyBrief?.status ?? "DRAFT",
          authorName: client.strategyBrief?.author?.name ?? null,
          authorId: client.strategyBrief?.authorId ?? null,
          approvedByName: client.strategyBrief?.approvedBy?.name ?? null,
          values: (client.strategyBrief ?? {}) as Record<string, string | null>,
          ...(() => {
            const completeness = deriveBriefCompleteness(client.strategyBrief);
            return {
              missing: completeness.missing,
              answered: completeness.answered,
              total: completeness.total,
            };
          })(),
        }}
      />

      <ClientQuality
        clientId={client.id}
        currentUserId={actor.id}
        canTest={can(actor, "qa.test")}
        canClose={can(actor, "qa.closeDefect")}
        canApprove={can(actor, "qa.approve")}
        assignees={options.users}
        defects={client.defects.map((defect) => ({
          id: defect.id,
          reference: defect.reference,
          title: defect.title,
          severity: defect.severity,
          status: defect.status,
          description: defect.description,
          assignedToName: defect.assignedTo?.name ?? null,
          assignedToId: defect.assignedToId,
          dueDate: defect.dueDate?.toISOString() ?? null,
          closureOverrideReason: defect.closureOverrideReason,
          isOpen: isDefectOpen(defect.status),
        }))}
        qaPlans={client.qaPlans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          deliverable: plan.deliverable,
          status: plan.status,
          tests: plan.tests.map((test) => ({
            id: test.id,
            objective: test.objective,
            status: test.status,
            actualResult: test.actualResult,
          })),
        }))}
      />

      {/* Sits between quality assurance and launch, which is the order it
          happens in: the work passes QA, the client signs it off, it goes
          live. */}
      <ClientApprovals
        clientId={client.id}
        canRecord={can(actor, "revisions.recordApproval")}
        contactCount={client.contacts.length}
        approvalTypes={CLIENT_APPROVAL_TYPES.map((option) => ({
          value: option.value,
          label: option.label,
        }))}
        approvers={client.contacts
          .filter((contact) => contact.isApprover)
          .map((contact) => ({
            id: contact.id,
            name: contact.name,
            role: contact.role,
          }))}
        projects={client.projects.map((project) => ({
          id: project.id,
          name: project.name,
        }))}
        approvals={client.approvals.map((approval) => ({
          id: approval.id,
          type: approval.type,
          typeLabel: formatEnumLabel(approval.type),
          subject: approval.subject,
          status: approval.status,
          approvedByName: approval.approvedByName,
          approvedAt: approval.approvedAt.toISOString(),
          evidenceUrl: approval.evidenceUrl,
          notes: approval.notes,
          recordedByName: approval.recordedBy?.name ?? null,
          projectName: approval.project?.name ?? null,
          withdrawnReason: approval.withdrawnReason,
          withdrawnByName: approval.withdrawnBy?.name ?? null,
          countsForLaunch: isVerifiableApproval(approval),
          shortfall: describeApprovalShortfall(approval),
        }))}
      />

      <ClientLaunches
        clientId={client.id}
        canSchedule={can(actor, "launch.schedule")}
        canActivate={can(actor, "launch.activate")}
        owners={options.users}
        launches={client.launches.map((launch) => {
          const readiness = deriveLaunchReadiness(launch);

          return {
            id: launch.id,
            name: launch.name,
            status: launch.status,
            scheduledFor: launch.scheduledFor?.toISOString() ?? null,
            ownerName: launch.owner?.name ?? null,
            backupVerified: launch.backupVerifiedAt !== null,
            rollbackPlan: launch.rollbackPlan,
            isFrozen: launch.isFrozen,
            freezeReason: launch.freezeReason,
            checklistItems: launch.checklistItems.map((item) => ({
              id: item.id,
              label: item.label,
              status: item.status,
              isRequired: item.isRequired,
            })),
            monitoringChecks: launch.monitoringChecks.map((check) => ({
              id: check.id,
              window: check.window,
              result: check.result,
              dueAt: check.dueAt?.toISOString() ?? null,
              observations: check.observations,
            })),
            readinessBlockers: readiness.blockers,
            isReady: readiness.ready,
            completedRequired: readiness.completedRequired,
            totalRequired: readiness.totalRequired,
          };
        })}
      />

      <ClientAccess
        clientId={client.id}
        canEdit={can(actor, "security.manageAccess")}
        records={client.accessRecords.map((record) => ({
          id: record.id,
          platform: record.platform,
          platformLabel: record.platformLabel,
          accountName: record.accountName,
          status: record.status,
          permissionLevel: record.permissionLevel,
          isCritical: record.isCritical,
          twoFactorEnabled: record.twoFactorEnabled,
          credentialLocation: record.credentialLocation,
          missingPermissions: record.missingPermissions,
        }))}
      />

      <ClientProjects
        clientId={client.id}
        canEdit={can(actor, "projects.manage")}
        managers={options.users}
        projects={client.projects.map((project) => {
          const progress = deriveProjectProgress(project.milestones);

          return {
            id: project.id,
            name: project.name,
            status: project.status,
            riskLevel: project.riskLevel,
            managerName: project.projectManager?.name ?? null,
            targetLaunchDate: project.targetLaunchDate?.toISOString() ?? null,
            percentComplete: progress.percentComplete,
            currentMilestone: progress.currentMilestone,
            nextMilestone: progress.nextMilestone,
            overdueMilestones: progress.overdueCount,
            milestones: project.milestones.map((milestone) => ({
              id: milestone.id,
              name: milestone.name,
              dueDate: milestone.dueDate?.toISOString() ?? null,
              completedAt: milestone.completedAt?.toISOString() ?? null,
              isOverdue:
                milestone.completedAt === null
                && milestone.dueDate !== null
                && milestone.dueDate < new Date(),
            })),
          };
        })}
      />

      {/* Money is owner business. The project manager still learns that payment
          is outstanding through the stage gate, without seeing any amounts. */}
      {canViewFinance ? (
        <ClientInvoices
          clientId={client.id}
          canEdit={canEditFinance}
          invoices={client.invoices.map((invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status,
            amountDue: Number(invoice.amountDue),
            amountPaid: Number(invoice.amountPaid),
            currency: invoice.currency,
            issuedAt: invoice.issuedAt?.toISOString() ?? null,
            dueAt: invoice.dueAt?.toISOString() ?? null,
            paidAt: invoice.paidAt?.toISOString() ?? null,
            failureReason: invoice.failureReason,
          }))}
        />
      ) : null}

      {canManageClient ? (
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <ClientForm
            users={options.users}
            stages={options.stages}
            serviceTypes={serviceTypeOptions}
            client={{
              id: client.id,
              clientName: client.clientName,
              companyName: client.companyName,
              contactEmail: client.contactEmail,
              contactPhone: client.contactPhone,
              assignedUserId: client.assignedUserId,
              status: client.status,
              serviceType: client.serviceType,
              currentStageId: client.currentStageId,
              notes: client.notes,
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
              <CardDescription>
                Delete the client if the account should be removed from the system.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-7 text-slate-600">
                This removes the client profile and pipeline history. Linked internal tasks stay in the system but lose the client reference.
              </p>
              <DeleteClientButton
                clientId={client.id}
                companyName={client.companyName}
              />
            </CardContent>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Linked Delivery Work</CardTitle>
            <CardDescription>
              Internal agency tasks currently tied to this account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {client.agencyTasks.length ? (
                  client.agencyTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-950">{task.title}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatEnumLabel(task.category)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>{task.assignedTo.name}</TableCell>
                      <TableCell>{formatDate(task.dueDate)}</TableCell>
                      <TableCell>{formatEnumLabel(task.status)}</TableCell>
                      <TableCell>{formatEnumLabel(task.priority)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                      No internal delivery tasks are linked to this account yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>Context and delivery details for the account.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="leading-7 text-slate-600">{client.notes ?? "No notes added yet."}</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Stage History</CardTitle>
          <CardDescription>Every stage change is stored for accountability.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {client.stageHistory.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {entry.fromStage?.name ?? "Created"} to {entry.toStage.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {entry.changedBy?.name ?? "System"}
                  </p>
                </div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  {formatDateTime(entry.changedAt)}
                </p>
              </div>
              {entry.note ? <p className="mt-3 text-sm text-slate-600">{entry.note}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
