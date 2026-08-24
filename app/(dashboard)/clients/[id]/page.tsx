import { notFound } from "next/navigation";

import { ClientAccount } from "@/components/clients/client-account";
import { ClientHeader } from "@/components/clients/client-header";
import { ClientIntegrations } from "@/components/clients/client-integrations";
import { ClientOverview } from "@/components/clients/client-overview";
import { ClientTabs } from "@/components/clients/client-tabs";
import { ClientAccess } from "@/components/clients/client-access";
import { ClientApprovals } from "@/components/clients/client-approvals";
import { ClientBrief } from "@/components/clients/client-brief";
import { ClientGrowth } from "@/components/clients/client-growth";
import { ClientHealth } from "@/components/clients/client-health";
import { ClientOffboarding } from "@/components/clients/client-offboarding";
import { ClientIntake } from "@/components/clients/client-intake";
import { ClientInvoices } from "@/components/clients/client-invoices";
import { ClientLaunches } from "@/components/clients/client-launches";
import { ClientProjects } from "@/components/clients/client-projects";
import { ClientQuality } from "@/components/clients/client-quality";
import { ClientReporting } from "@/components/clients/client-reporting";
import { ClientStatusSelect } from "@/components/clients/client-status-select";
import { JourneyOverview } from "@/components/clients/journey-overview";
import { StageReadiness } from "@/components/clients/stage-readiness";
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
import type { ClientTab } from "@/lib/clients/client-workspace";
import { getJourneySummaryCards } from "@/lib/data/client-metrics-query";
import { getClientRow } from "@/lib/data/clients-dashboard-query";
import { prisma } from "@/lib/prisma";
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
import {
  OPTIMIZATION_DECISIONS,
  REPORT_TYPES,
  isOptimizationConcluded,
  isReportLate,
} from "@/lib/success/report-service";
import {
  EXPANSION_STATUSES,
  EXPANSION_TYPES,
  RENEWAL_STAGES,
  isExpansionDecided,
  isRenewalSettled,
  renewalRunway,
} from "@/lib/growth/renewal-service";
import {
  TESTIMONIAL_FORMATS,
  TESTIMONIAL_PERMISSIONS,
  TESTIMONIAL_STATUSES,
  canPublishTestimonial,
  describePublishingBlockers,
  grantedPermissions,
} from "@/lib/growth/advocacy-service";
import {
  OFFBOARDING_REASONS,
  OFFBOARDING_STEPS,
  isOffboardingComplete,
  outstandingOffboardingSteps,
} from "@/lib/success/offboarding-service";
import { deriveBriefCompleteness } from "@/lib/strategy/brief-service";
import {
  deriveIntakeProgress,
  sectionsForService,
} from "@/lib/intake/question-catalogue";
import { can, canAccessAssignedRecord, canManageClients, teamRoleLabels } from "@/lib/permissions";
import {
  JOURNEY_OWNERSHIP,
  deriveOwnership,
  journeyPosition,
} from "@/lib/workflow/handoff-engine";
import { requireUser } from "@/lib/session";
import { formatDate, formatDateTime, formatEnumLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/** Only the tabs that exist. Anything else falls back to the overview. */
const TAB_KEYS: ClientTab[] = [
  "overview",
  "contacts",
  "services",
  "tasks",
  "journey",
  "quality",
  "reports",
  "files",
  "activity",
  "integrations",
];

/**
 * One client account.
 *
 * The sections below are the ones that were already here, moved under tabs and
 * otherwise untouched - the account form, the brief, quality, launches, access,
 * reporting, growth and offboarding all keep their own props and their own
 * behaviour. What is new is the header, the Overview tab, and the fact that ten
 * panels no longer stack into one very long page.
 *
 * Journey is deliberately left alone. Its tab renders the journey overview and
 * stage readiness controls that were already on this page; the Journey page
 * itself is not touched by any of this.
 */
export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;

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

  /*
   * The same derived row the directory shows, through the same query and the
   * same mapper - so an account reading "2 overdue, waiting on client" on the
   * dashboard reads exactly that here.
   *
   * The portfolio row at the top of the Overview is the Journey board's own six
   * cards, counted by the board's own code. Those six words belong to Journey,
   * and an Overview that answered them differently made the two pages
   * contradict each other on the same eleven accounts.
   */
  const [row, metricCards] = await Promise.all([
    getClientRow(actor, id),
    getJourneySummaryCards(actor, new Date()),
  ]);

  const activity = await prisma.activityLog.findMany({
    where: { entityType: "CLIENT", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      action: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
  });

  const requested = typeof query.tab === "string" ? (query.tab as ClientTab) : "overview";
  const initialTab = TAB_KEYS.includes(requested) ? requested : "overview";

  /*
   * Who last touched the standing internal note.
   *
   * The note is a column on the client, so it carries no author of its own -
   * this reads the last activity entry that recorded a change to it, which is
   * what the internal-note route writes.
   */
  const noteEntry = client.notes
    ? await prisma.activityLog.findFirst({
        where: {
          entityType: "CLIENT",
          entityId: id,
          action: { contains: "internal account note" },
        },
        orderBy: { createdAt: "desc" },
        select: { actor: { select: { name: true } } },
      })
    : null;

  const noteAuthor = noteEntry?.actor?.name ?? null;

  const assessment = client.healthAssessments[0] ?? null;

  return (
    <div className="space-y-5">
      <ClientHeader
        client={{
          id: client.id,
          companyName: client.companyName,
          clientName: client.clientName,
          contactEmail: client.contactEmail,
          contactPhone: client.contactPhone,
          stageName: client.currentStage.name,
          currentStageId: client.currentStageId,
          serviceType: client.serviceType,
          status: client.status,
          healthStatus: client.healthStatus,
          currentBlocker: client.currentBlocker,
          ownerName: client.assignedUser?.name ?? null,
          ownerRole: client.assignedUser
            ? teamRoleLabels[client.assignedUser.teamRole]
            : null,
          monthlyValue: client.monthlyValue === null ? null : Number(client.monthlyValue),
        }}
        canManage={canManageClient}
        stages={options.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          color: stage.color,
          position: stage.position,
          requirementCount: stage._count.requirements,
        }))}
        /* The same two permissions the Journey page gates on, so the header
           cannot offer a move this person would be refused for. */
        canMoveStage={can(actor, "journey.move")}
        canOverrideStage={can(actor, "journey.override")}
        canDelete={can(actor, "clients.delete")}
        record={{
          values: {
            clientName: client.clientName,
            companyName: client.companyName,
            contactEmail: client.contactEmail,
            contactPhone: client.contactPhone ?? "",
            serviceType: client.serviceType,
          },
          /* Carried through unchanged: the endpoint takes the whole form, and
             each of these is set somewhere else on this page. */
          passthrough: {
            assignedUserId: client.assignedUserId,
            status: client.status,
            currentStageId: client.currentStageId,
            notes: client.notes,
          },
          serviceTypes: serviceTypeOptions,
        }}
        canViewFinance={canViewFinance}
        canAssignWork={can(actor, "workItems.assign")}
        assignees={options.users.map((member) => ({ id: member.id, name: member.name }))}
        statusControl={
          <ClientStatusSelect
            clientId={client.id}
            value={client.status}
            disabled={!canEditStatus}
          />
        }
      />

      <ClientTabs
        initial={initialTab}
        panels={{
          overview: row ? (
            <ClientOverview
              client={row}
              metricCards={metricCards}
              services={client.projects.map((project) => ({
                id: project.id,
                name: project.name,
                serviceType: project.serviceType,
                status: project.status,
                ownerName: project.projectManager?.name ?? null,
                startDate: project.startDate?.toISOString() ?? null,
              }))}
              contacts={client.contacts.map((contact) => ({
                id: contact.id,
                name: contact.name,
                role: contact.role,
                email: contact.email,
                phone: contact.phone,
                isPrimary: contact.isPrimary,
                isDecisionMaker: contact.isDecisionMaker,
                isApprover: contact.isApprover,
              }))}
              activity={activity.map((entry) => ({
                id: entry.id,
                action: entry.action,
                actorName: entry.actor?.name ?? null,
                createdAt: entry.createdAt.toISOString(),
              }))}
              tasks={client.agencyTasks.map((task) => ({
                status: task.status as string,
                dueDate: task.dueDate?.toISOString() ?? null,
              }))}
              healthNote={
                assessment
                  ? {
                      assessedAt: assessment.assessedAt.toISOString(),
                      assessedBy: assessment.assessedBy?.name ?? null,
                      summary: assessment.summary,
                      // 0-100, and genuinely optional: an assessment can be
                      // recorded without one, and a made-up number would be
                      // worse than none.
                      healthScore: assessment.healthScore,
                    }
                  : null
              }
              canSeeFinance={canViewFinance}
              serverNow={new Date().toISOString()}
            />
          ) : null,

          contacts: (
            <ClientAccount
              clientId={client.id}
              company={{
                companyName: client.companyName,
                monthlyValue:
                  canViewFinance && client.monthlyValue !== null
                    ? Number(client.monthlyValue)
                    : null,
                legalName: client.legalName ?? "",
                website: client.website ?? "",
                industry: client.industry ?? "",
                addressLine1: client.addressLine1 ?? "",
                addressLine2: client.addressLine2 ?? "",
                city: client.city ?? "",
                stateRegion: client.stateRegion ?? "",
                postalCode: client.postalCode ?? "",
                country: client.country ?? "",
                businessPhone: client.businessPhone ?? "",
                businessEmail: client.businessEmail ?? "",
                serviceArea: client.serviceArea ?? "",
                taxId: client.taxId ?? "",
                timezone: client.timezone ?? "",
              }}
              contacts={client.contacts.map((contact) => ({
                id: contact.id,
                name: contact.name,
                role: contact.role,
                email: contact.email,
                phone: contact.phone,
                isPrimary: contact.isPrimary,
                isDecisionMaker: contact.isDecisionMaker,
                isApprover: contact.isApprover,
                communicationPreference: contact.communicationPreference,
                status: contact.status,
              }))}
              /* The live agreement: a signed one wins, otherwise the newest. */
              contract={(() => {
                const current =
                  client.contracts.find((row) => row.agreementStatus === "SIGNED")
                  ?? client.contracts[0]
                  ?? null;

                if (!current) return null;

                return {
                  id: current.id,
                  title: current.title,
                  agreementStatus: current.agreementStatus,
                  recurringFee:
                    current.recurringFee === null ? null : Number(current.recurringFee),
                  contractValue:
                    current.contractValue === null ? null : Number(current.contractValue),
                  billingCadence: current.billingCadence,
                  startDate: current.startDate?.toISOString() ?? null,
                  endDate: current.endDate?.toISOString() ?? null,
                  renewalDate:
                    current.renewalDate?.toISOString()
                    ?? client.renewalDate?.toISOString()
                    ?? null,
                  paymentTerms: current.paymentTerms,
                  autoRenew: current.autoRenew,
                  documentUrl: current.documentUrl,
                };
              })()}
              ownership={{
                assignedUserId: client.assignedUserId,
                owner: client.assignedUser?.name ?? null,
                /* The seats this account actually has, from its workstreams. */
                seats: client.workstreams.map((stream) => ({
                  role: stream.role,
                  label: teamRoleLabels[stream.role],
                  ownerId: stream.ownerId,
                })),
              }}
              users={options.users.map((member) => ({
                id: member.id,
                name: member.name,
                teamRole: member.teamRole,
              }))}
              internalNote={client.notes}
              noteAuthor={noteAuthor}
              noteUpdatedAt={client.updatedAt.toISOString()}
              nextStep={{
                currentBlocker: client.currentBlocker ?? "",
                nextAction: client.nextAction ?? "",
                nextActionDueAt: client.nextActionDueAt?.toISOString() ?? "",
              }}
              canEdit={canManageClient}
              canSeeFinance={canViewFinance}
              canEditFinance={canEditFinance}
              serverNow={new Date().toISOString()}
            />
          ),

          services: (
            <div className="space-y-6">
              {/* Intake comes before the brief: the brief is written from what the
                  client tells us here. */}
              {(() => {
                const form = client.intakeForm;
                const answers = (form?.answers as Record<string, string> | null) ?? null;
                const progress = deriveIntakeProgress(client.serviceType, answers);

                return (
                  <ClientIntake
                    clientId={client.id}
                    canManage={can(actor, "clients.edit")}
                    intake={{
                      exists: form !== null,
                      status: form?.status ?? "NOT_SENT",
                      sentAt: form?.sentAt?.toISOString() ?? null,
                      viewedAt: form?.viewedAt?.toISOString() ?? null,
                      submittedAt: form?.submittedAt?.toISOString() ?? null,
                      reviewedAt: form?.reviewedAt?.toISOString() ?? null,
                      reviewedByName: form?.reviewedBy?.name ?? null,
                      reviewNotes: form?.reviewNotes ?? null,
                      expiresAt: form?.expiresAt?.toISOString() ?? null,
                      percent: progress.percent,
                      missingRequired: progress.missingRequired,
                      groups: form?.submittedAt
                        ? sectionsForService(client.serviceType).map((section) => ({
                            title: section.title,
                            answers: section.questions.map((question) => ({
                              label: question.label,
                              value: answers?.[question.id] ?? null,
                            })),
                          }))
                        : [],
                    }}
                  />
                );
              })()}
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
            </div>
          ),

          tasks: (
            <div className="space-y-6">
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
            </div>
          ),

          journey: (
            <div className="space-y-6">
              {/* The five questions, answered without opening anything else. */}
              {(() => {
                const stageKey = client.currentStage.stageKey;
                const position = journeyPosition(stageKey);
                const ownership = deriveOwnership(stageKey, client.serviceType);
                const openTasks = client.agencyTasks.filter((task) => task.status !== "DONE");

                // Waiting on the client is a different kind of stuck from blocked, and
                // conflating them is why nobody could tell whose move it was.
                const waitingOnClient = openTasks.some(
                  (task) => task.status === "WAITING_CLIENT",
                );

                const blockers = [
                  ...(client.currentBlocker ? [client.currentBlocker] : []),
                  ...openTasks
                    .filter((task) => task.status === "BLOCKED" || task.status === "WAITING_CLIENT")
                    .map((task) => task.title),
                ];

                return (
                  <JourneyOverview
                    clientId={client.id}
                    stageName={client.currentStage.name}
                    progressPercent={
                      position === null
                        ? 0
                        : Math.round(((position + 1) / JOURNEY_OWNERSHIP.length) * 100)
                    }
                    currentOwnerLabel={ownership.current
                      .map((role) => teamRoleLabels[role])
                      .join(" + ")}
                    currentOwnerName={client.currentOwner?.name ?? client.assignedUser?.name ?? null}
                    nextOwnerLabel={
                      ownership.next.length
                        ? ownership.next.map((role) => teamRoleLabels[role]).join(" + ")
                        : "Nobody — end of the journey"
                    }
                    openTaskCount={openTasks.length}
                    targetLaunch={client.contractEndDate}
                    blockers={blockers}
                    waitingOnClient={waitingOnClient && blockers.length > 0}
                    steps={JOURNEY_OWNERSHIP.map((entry, index) => ({
                      stageKey: entry.stageKey,
                      label: entry.stageKey.replaceAll("_", " "),
                      state:
                        position === null
                          ? "future"
                          : index < position
                            ? "done"
                            : index === position
                              ? "current"
                              : "future",
                    }))}
                    workstreams={client.workstreams
                      .filter((stream) => stream.isRequired)
                      .map((stream) => ({
                        role: stream.role,
                        label: teamRoleLabels[stream.role],
                        ownerName: stream.owner?.name ?? null,
                        stage: stream.stage,
                        isRequired: stream.isRequired,
                      }))}
                  />
                );
              })()}
              <div id="readiness">
                <StageReadiness
                  clientId={client.id}
                  currentStagePosition={client.currentStage.position}
                />
              </div>
            </div>
          ),

          quality: (
            <div className="space-y-6">
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
            </div>
          ),

          reports: (
            <div className="space-y-6">
              {/* Reporting sits beside health because they answer the same question
                  from two directions: what we told them, and how they are doing. */}
              <ClientReporting
                clientId={client.id}
                canManage={can(actor, "reporting.client")}
                currentUserId={actor.id}
                reportTypes={REPORT_TYPES.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                decisions={OPTIMIZATION_DECISIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                owners={options.users}
                reports={client.reports.map((report) => ({
                  id: report.id,
                  type: report.type,
                  status: report.status,
                  periodStart: report.periodStart.toISOString(),
                  periodEnd: report.periodEnd.toISOString(),
                  dueAt: report.dueAt?.toISOString() ?? null,
                  sentAt: report.sentAt?.toISOString() ?? null,
                  dataValidated: report.dataValidatedAt !== null,
                  dataSources: report.dataSources,
                  knownLimitations: report.knownLimitations,
                  recommendedActions: report.recommendedActions,
                  documentUrl: report.documentUrl,
                  preparedByName: report.preparedBy?.name ?? null,
                  preparedById: report.preparedById,
                  reviewedByName: report.reviewedBy?.name ?? null,
                  acknowledged: report.clientAcknowledgedAt !== null,
                  isLate: isReportLate(report),
                }))}
                optimizations={client.optimizations.map((item) => ({
                  id: item.id,
                  platform: item.platform,
                  observedProblem: item.observedProblem,
                  proposedChange: item.proposedChange,
                  hypothesis: item.hypothesis,
                  expectedMetric: item.expectedMetric,
                  previousSetting: item.previousSetting,
                  newSetting: item.newSetting,
                  result: item.result,
                  decision: item.decision,
                  ownerName: item.owner?.name ?? null,
                  startDate: item.startDate?.toISOString() ?? null,
                  endDate: item.endDate?.toISOString() ?? null,
                  isConcluded: isOptimizationConcluded(item.decision),
                }))}
              />
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
              {/* The end of the journey, in the order it happens: what comes next
                  commercially, then the exit if there is one. */}
              {(() => {
                const record = client.renewals[0] ?? null;
                const runway = renewalRunway(record?.renewalDate ?? client.renewalDate);

                return (
                  <ClientGrowth
                    clientId={client.id}
                    canManage={can(actor, "renewals.manage")}
                    canCreateLeads={can(actor, "renewals.manage")}
                    owners={options.users}
                    renewalStages={RENEWAL_STAGES.map((o) => ({ value: o.value, label: o.label }))}
                    expansionTypes={EXPANSION_TYPES.map((o) => ({ value: o.value, label: o.label }))}
                    expansionStatuses={EXPANSION_STATUSES.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                    testimonialFormats={TESTIMONIAL_FORMATS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                    testimonialStatuses={TESTIMONIAL_STATUSES.map((o) => ({
                      value: o.value,
                      label: o.label,
                    }))}
                    testimonialPermissions={TESTIMONIAL_PERMISSIONS.map((o) => ({
                      key: o.key,
                      label: o.label,
                    }))}
                    renewal={{
                      exists: record !== null,
                      stage: record?.stage ?? "NOT_STARTED",
                      renewalDate:
                        (record?.renewalDate ?? client.renewalDate)?.toISOString() ?? null,
                      currentPackage: record?.currentPackage ?? null,
                      recommendedPackage: record?.recommendedPackage ?? null,
                      currentValue: record?.currentValue === null || record === null
                        ? null
                        : Number(record.currentValue),
                      renewalValue: record?.renewalValue === null || record === null
                        ? null
                        : Number(record.renewalValue),
                      clientInterest: record?.clientInterest ?? null,
                      nextAction: record?.nextAction ?? null,
                      outcomeNote: record?.outcomeNote ?? null,
                      ownerName: record?.owner?.name ?? null,
                      daysUntil: runway.daysUntil,
                      window: runway.window,
                      overdue: runway.overdue,
                      isSettled: record ? isRenewalSettled(record.stage) : false,
                    }}
                    expansions={client.expansionOpportunities.map((item) => ({
                      id: item.id,
                      type: item.type,
                      status: item.status,
                      title: item.title,
                      description: item.description,
                      estimatedValue:
                        item.estimatedValue === null ? null : Number(item.estimatedValue),
                      ownerName: item.owner?.name ?? null,
                      outcomeNote: item.outcomeNote,
                      isDecided: isExpansionDecided(item.status),
                    }))}
                    testimonials={client.testimonials.map((item) => ({
                      id: item.id,
                      format: item.format,
                      status: item.status,
                      content: item.content,
                      publishingChannels: item.publishingChannels,
                      permissions: grantedPermissions(item),
                      blockers: describePublishingBlockers(item),
                      canPublish: canPublishTestimonial(item),
                    }))}
                    referrals={client.referralsGiven.map((item) => ({
                      id: item.id,
                      contactName: item.contactName,
                      businessName: item.businessName,
                      status: item.status,
                      permissionGranted: item.permissionGranted,
                      outcome: item.outcome,
                      leadId: item.leadId,
                      assignedToName: item.assignedTo?.name ?? null,
                    }))}
                  />
                );
              })()}
              {(() => {
                const record = client.offboarding;

                return (
                  <ClientOffboarding
                    clientId={client.id}
                    canManage={can(actor, "offboarding.manage")}
                    owners={options.users}
                    reasons={OFFBOARDING_REASONS.map((o) => ({ value: o.value, label: o.label }))}
                    offboarding={{
                      exists: record !== null,
                      status: record?.status ?? "REQUESTED",
                      reason: record?.reason ?? "OTHER",
                      reasonDetail: record?.reasonDetail ?? null,
                      remainingWork: record?.remainingWork ?? null,
                      lessonsLearned: record?.lessonsLearned ?? null,
                      ownerName: null,
                      steps: OFFBOARDING_STEPS.map((step) => ({
                        key: step.key,
                        label: step.label,
                        why: step.why,
                        done: record
                          ? step.key === "remainingWorkCleared"
                            ? Boolean(record.remainingWork?.trim())
                            : record[step.key] !== null
                          : false,
                      })),
                      outstanding: record
                        ? outstandingOffboardingSteps(record).map((step) => step.label)
                        : OFFBOARDING_STEPS.map((step) => step.label),
                      complete: record ? isOffboardingComplete(record) : false,
                    }}
                  />
                );
              })()}
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
            </div>
          ),

          files: (
            <div className="space-y-6">
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
            </div>
          ),

          activity: (
            <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Notes</CardTitle>
                    <CardDescription>Context and delivery details for the account.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="leading-7 text-slate-600">{client.notes ?? "No notes added yet."}</p>
                  </CardContent>
                </Card>
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
          ),

          integrations: (
            <ClientIntegrations clientId={client.id} companyName={client.companyName} />
          ),
        }}
      />
    </div>
  );
}
