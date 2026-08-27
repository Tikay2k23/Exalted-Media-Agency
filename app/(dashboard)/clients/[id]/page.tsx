import { notFound } from "next/navigation";

import { ClientAccount } from "@/components/clients/client-account";
import { ClientStrategy } from "@/components/clients/client-strategy";
import { ClientHeader } from "@/components/clients/client-header";
import { ClientIntegrations } from "@/components/clients/client-integrations";
import { ClientOverview } from "@/components/clients/client-overview";
import { ClientJourneyView } from "@/components/journey/client/client-journey-view";
import { ClientWork } from "@/components/clients/client-work";
import { ClientTabs } from "@/components/clients/client-tabs";
import { ClientAccess } from "@/components/clients/client-access";
import { ClientBrief } from "@/components/clients/client-brief";
import { ClientGrowth } from "@/components/clients/client-growth";
import { ClientOffboarding } from "@/components/clients/client-offboarding";
import { ClientIntake } from "@/components/clients/client-intake";
import { ClientInvoices } from "@/components/clients/client-invoices";
import { ClientProjects } from "@/components/clients/client-projects";
import { ClientApprovalWorkspace } from "@/components/clients/client-approval-workspace";
import { ClientReportsHealth } from "@/components/clients/client-reports-health";
import { ClientStatusSelect } from "@/components/clients/client-status-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
} from "@/components/ui/table";
import {
  getClientDetail,
  getSharedOptions,
  serviceTypeOptions,
} from "@/lib/data/queries";
import { loadAuthContext } from "@/lib/authz";
import { type ClientTab, nextMilestone } from "@/lib/clients/client-workspace";
import { getJourneySummaryCards } from "@/lib/data/client-metrics-query";
import { getClientRow } from "@/lib/data/clients-dashboard-query";
import { getJourneyClientDetail } from "@/lib/data/journey-client-query";
import { prisma } from "@/lib/prisma";
import { deriveProjectProgress } from "@/lib/delivery/project-service";
import {
  CLIENT_APPROVAL_TYPES,
  isVerifiableApproval,
} from "@/lib/approvals/approval-service";
import { approvalGate } from "@/lib/quality/approval-gate";
import {
  goalProgress,
  healthSummary,
  nextReportingAction,
  optimizationSummary,
  renewalSummary,
  reportSummary,
} from "@/lib/success/reports-health";
import { isComplaintOpen } from "@/lib/success/health-service";
import { REPORT_TYPES } from "@/lib/success/report-service";
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
import { a2pInPlay, a2pReadiness } from "@/lib/a2p/a2p-readiness";
import { deriveBriefCompleteness } from "@/lib/strategy/brief-service";
import {
  STRATEGY_SECTIONS,
  type SectionStatus,
  sectionApplies,
  strategyProgress,
} from "@/lib/strategy/strategy-sections";
import {
  deriveIntakeProgress,
  sectionsForService,
} from "@/lib/intake/question-catalogue";
import { can, canAccessAssignedRecord, canManageClients, teamRoleLabels } from "@/lib/permissions";
import {
} from "@/lib/workflow/handoff-engine";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

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

  /*
   * The Approvals gate, computed once from the rows the tab already loads.
   *
   * Assembled here rather than inside the card so the summary tiles, the
   * panels and the launch review are all reading one calculation - the whole
   * point being that a page cannot show 65% QA beside a clear launch light.
   */
  const approvalNow = new Date();
  const approvalQaChecks = client.qaPlans.flatMap((plan) =>
    plan.tests.map((test) => ({
      id: test.id,
      objective: test.objective,
      status: test.status as string,
      planName: plan.name,
      testerName: test.testerId ? (options.users.find((u) => u.id === test.testerId)?.name ?? null) : null,
      evidenceUrl: test.evidenceUrl,
      retestRequired: test.retestRequired,
    })),
  );
  const approvalDefects = client.defects.map((defect) => ({
    id: defect.id,
    reference: defect.reference,
    title: defect.title,
    severity: defect.severity as string,
    status: defect.status as string,
    assignedToName: defect.assignedTo?.name ?? null,
    reportedAt: defect.createdAt.toISOString(),
    dueDate: defect.dueDate?.toISOString() ?? null,
  }));
  /* The newest launch is the one being prepared; older ones are history. */
  const approvalLaunch = client.launches[0] ?? null;
  const approvalLaunchChecks = (approvalLaunch?.checklistItems ?? []).map((item) => ({
    id: item.id,
    label: item.label,
    category: item.category as string,
    status: item.status as string,
    isRequired: item.isRequired,
    evidenceUrl: item.evidenceUrl,
  }));

  const approvalGateState = approvalGate({
    qa: approvalQaChecks,
    defects: approvalDefects,
    rounds: client.reviewCycles.map((cycle) => ({
      id: cycle.id,
      roundNumber: cycle.roundNumber,
      status: cycle.status as string,
      sentAt: cycle.sentAt?.toISOString() ?? null,
      feedbackDeadline: cycle.feedbackDeadline?.toISOString() ?? null,
      approverName: cycle.approverContact?.name ?? null,
      projectName: cycle.project?.name ?? null,
      openRevisions: cycle.revisions.filter(
        (revision) =>
          revision.status !== "COMPLETE"
          && revision.status !== "DECLINED"
          && revision.status !== "DEFERRED",
      ).length,
    })),
    records: client.approvals.map((approval) => ({
      id: approval.id,
      subject: approval.subject,
      approvedByName: approval.approvedByName,
      approvedAt: approval.approvedAt.toISOString(),
      evidenceUrl: approval.evidenceUrl,
      countsForLaunch: isVerifiableApproval(approval),
    })),
    launch: approvalLaunchChecks,
    now: approvalNow,
  });

  /*
   * The approval trail, from the activity log rather than a second table.
   *
   * Every service on this path already writes an entry - defects, QA runs,
   * sign-offs, launches - so the history is a reading of what happened rather
   * than a parallel record that could disagree with it.
   */
  const approvalHistory = activity
    .map((entry) => {
      const text = entry.action.toLowerCase();
      const kind = /defect/.test(text)
        ? ("defect" as const)
        : /qa|test/.test(text)
          ? ("qa" as const)
          : /approv|sign-?off|revision/.test(text)
            ? ("approval" as const)
            : /launch|go.?live/.test(text)
              ? ("launch" as const)
              : ("other" as const);

      return {
        id: entry.id,
        action: entry.action,
        actorName: entry.actor?.name ?? null,
        createdAt: entry.createdAt.toISOString(),
        kind,
      };
    })
    // Approval-relevant events only: the rest belongs on the Activity tab.
    .filter((entry) => entry.kind !== "other");

  /*
   * Reports & Health, assembled from the five systems that already own it.
   *
   * Computed here so the four tiles, the panels and the next-action line all
   * read one calculation - the page cannot show a healthy score beside an
   * overdue report it forgot to count.
   */
  const reportRows = client.reports.map((report) => ({
    id: report.id,
    type: report.type as string,
    status: report.status as string,
    periodStart: report.periodStart.toISOString(),
    periodEnd: report.periodEnd.toISOString(),
    dueAt: report.dueAt?.toISOString() ?? null,
    sentAt: report.sentAt?.toISOString() ?? null,
    preparedByName: report.preparedBy?.name ?? null,
    documentUrl: report.documentUrl,
  }));

  const optimizationRows = client.optimizations.map((entry) => ({
    id: entry.id,
    platform: entry.platform,
    observedProblem: entry.observedProblem,
    proposedChange: entry.proposedChange,
    expectedMetric: entry.expectedMetric,
    result: entry.result,
    decision: entry.decision as string,
    ownerName: entry.owner?.name ?? null,
    startDate: entry.startDate?.toISOString() ?? null,
    endDate: entry.endDate?.toISOString() ?? null,
  }));

  const reportsSummary = reportSummary(reportRows, approvalNow);
  const optimizationsSummary = optimizationSummary(optimizationRows);
  const openComplaintCount = client.complaints.filter((c) => isComplaintOpen(c.status)).length;
  const latestAssessment = client.healthAssessments[0] ?? null;

  const healthPicture = healthSummary({
    assessment: latestAssessment
      ? {
          status: latestAssessment.status as string,
          healthScore: latestAssessment.healthScore,
          satisfactionScore: latestAssessment.satisfactionScore,
          openComplaints: latestAssessment.openComplaints,
          renewalProbability: latestAssessment.renewalProbability,
          assessedAt: latestAssessment.assessedAt.toISOString(),
        }
      : null,
    reports: reportsSummary,
    optimizations: optimizationsSummary,
    openComplaints: openComplaintCount,
    overdueTasks: client.agencyTasks.filter(
      (task) =>
        !task.deletedAt
        && !task.archivedAt
        && !["DONE", "APPROVED", "CANCELLED"].includes(task.status)
        && task.dueDate < approvalNow,
    ).length,
    now: approvalNow,
  });

  const goalPicture = goalProgress(
    client.strategyGoals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      metric: goal.metric,
      baseline: goal.baseline,
      target: goal.target,
      targetDate: goal.targetDate?.toISOString() ?? null,
      status: goal.status as string,
      ownerName: goal.owner?.name ?? null,
      priority: goal.priority as string,
    })),
    approvalNow,
  );

  const renewalRecord = client.renewals[0] ?? null;
  const renewalPicture = renewalSummary({
    renewalDate: (renewalRecord?.renewalDate ?? client.renewalDate)?.toISOString() ?? null,
    monthlyValue: client.monthlyValue ? Number(client.monthlyValue) : null,
    contractStart: client.contractStartDate?.toISOString() ?? null,
    contractEnd: client.contractEndDate?.toISOString() ?? null,
    stage: (renewalRecord?.stage as string | undefined) ?? null,
    now: approvalNow,
  });

  const reportsHealthProps = {
    clientId: client.id,
    companyName: client.companyName,
    reports: reportsSummary,
    reportRows,
    optimizations: optimizationsSummary,
    optimizationRows,
    health: healthPicture,
    goals: goalPicture,
    renewal: renewalPicture,
    next: nextReportingAction({
      reports: reportsSummary,
      health: healthPicture,
      optimizations: optimizationsSummary,
      goals: goalPicture,
      renewal: renewalPicture,
    }),
    owners: options.users,
    reportTypes: REPORT_TYPES.map((option) => ({ value: option.value, label: option.label })),
    openComplaints: openComplaintCount,
    permissions: {
      canReport: can(actor, "reporting.client"),
      canManageHealth: can(actor, "health.manage"),
      canViewFinance,
    },
  };

  const approvalWorkspaceProps = {
    clientId: client.id,
    gate: approvalGateState,
    qaChecks: approvalQaChecks,
    defects: approvalDefects,
    launchChecks: approvalLaunchChecks,
    launchId: approvalLaunch?.id ?? null,
    assignees: options.users,
    projects: client.projects.map((project) => ({ id: project.id, name: project.name })),
    /* Only contacts the account has marked as authorised to approve. */
    approvers: client.contacts
      .filter((contact) => contact.isApprover)
      .map((contact) => ({ id: contact.id, name: contact.name, role: contact.role })),
    approvalTypes: CLIENT_APPROVAL_TYPES.map((option) => ({
      value: option.value,
      label: option.label,
    })),
    history: approvalHistory,
    stage: {
      name: client.currentStage.name,
      ownerName: client.assignedUser?.name ?? null,
      dueDate: client.nextActionDueAt?.toISOString() ?? null,
      day: Math.max(
        1,
        Math.round(
          (approvalNow.getTime() - client.stageEnteredAt.getTime()) / 86_400_000,
        ),
      ),
      targetDays: client.currentStage.slaDays,
    },
    permissions: {
      canTest: can(actor, "qa.test"),
      canCloseDefect: can(actor, "qa.closeDefect"),
      canRecordApproval: can(actor, "revisions.recordApproval"),
      canActivateLaunch: can(actor, "launch.activate"),
    },
  };

  /*
   * End-of-day updates across this account's work.
   *
   * Read from the same entries My Work writes - the Work tab shows them, it
   * does not keep its own. Capped because the drawer is a recent history, not
   * an archive.
   */
  const clientEod = await prisma.employeeTaskEodEntry.findMany({
    where: { task: { clientId: id, deletedAt: null } },
    orderBy: { entryDate: "desc" },
    take: 40,
    select: {
      id: true,
      entryDate: true,
      summary: true,
      blockers: true,
      nextSteps: true,
      hoursSpent: true,
      createdAt: true,
      task: { select: { id: true, title: true } },
      author: { select: { name: true } },
    },
  });

  /*
   * The journey workspace, read through the same query the Journey page uses.
   *
   * The tab used to render a thinner summary of its own, built from a display
   * grouping rather than the stored stages, so the two disagreed about where a
   * client was the moment operations added a stage. One workspace, two places
   * to open it.
   */
  const { detail: journeyDetail } = await getJourneyClientDetail(actor, id);

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

          services: (() => {
            const form = client.intakeForm;
            const answers = (form?.answers as Record<string, string> | null) ?? null;
            const intakeProgress = deriveIntakeProgress(client.serviceType, answers);

            /*
             * Every service the account actually has, not only the headline
             * one. Which strategy sections are required depends on all of them.
             */
            const services = [
              client.serviceType,
              ...client.projects.map((project) => project.serviceType),
            ];

            const sections = STRATEGY_SECTIONS.filter((definition) =>
              sectionApplies(definition, services),
            ).map((definition) => {
              const sectionRow = client.strategySections.find(
                (candidate) => candidate.key === definition.key,
              );

              return {
                key: definition.key,
                status: (sectionRow?.status ?? "NOT_STARTED") as SectionStatus,
                ownerName: sectionRow?.owner?.name ?? null,
                approvedByName: sectionRow?.approvedBy?.name ?? null,
                approvedAt: sectionRow?.approvedAt?.toISOString() ?? null,
                notes: sectionRow?.notes ?? null,
              };
            });

            const progress = strategyProgress(
              client.strategySections.map((section) => ({
                key: section.key,
                status: section.status as SectionStatus,
              })),
              services,
            );

            /*
             * The next dated thing on this account. Journey owns milestones, so
             * this reads the row the workspace already derived rather than
             * keeping a second copy of the same dates.
             */
            const upcoming = row ? nextMilestone(row, new Date()) : null;

            /*
             * The A2P line appears when the client asked for text messaging on
             * their intake form, or when somebody has already started a profile
             * - not because of which service label sits on the account. The
             * readiness figure is calculated here from the profile and the
             * evidence on file, so the card cannot claim a number the profile
             * page would disagree with.
             */
            const a2pSummary = a2pInPlay(answers, client.a2pProfile !== null)
              ? (() => {
                  const readiness = a2pReadiness({
                    ...(client.a2pProfile ?? {}),
                    samples:
                      client.a2pProfile?.samples.map((sample) => ({
                        category: sample.category,
                        body: sample.body,
                      })) ?? [],
                    documents: client.assets
                      .filter((asset) => ["RECEIVED", "APPROVED"].includes(asset.status))
                      .map((asset) => asset.type),
                  });

                  return {
                    status: client.a2pProfile?.status ?? "INFORMATION_NEEDED",
                    percent: readiness.percent,
                    complete: readiness.complete,
                    total: readiness.total,
                    headline: readiness.headline,
                  };
                })()
              : null;

            /*
             * The existing intake workspace, untouched, handed to the new page
             * to reveal on demand. Sending, resending and reviewing still
             * happen only in here - there is one send path and this is it.
             */
            const intakeWorkspace = (
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
                  percent: intakeProgress.percent,
                  missingRequired: intakeProgress.missingRequired,
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

            const briefWorkspace = (
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
            );

            const projectsWorkspace = (
              <ClientProjects
                clientId={client.id}
                canEdit={can(actor, "projects.manage")}
                managers={options.users}
                projects={client.projects.map((project) => {
                  const projectProgress = deriveProjectProgress(project.milestones);

                  return {
                    id: project.id,
                    name: project.name,
                    status: project.status,
                    riskLevel: project.riskLevel,
                    managerName: project.projectManager?.name ?? null,
                    targetLaunchDate: project.targetLaunchDate?.toISOString() ?? null,
                    percentComplete: projectProgress.percentComplete,
                    currentMilestone: projectProgress.currentMilestone,
                    nextMilestone: projectProgress.nextMilestone,
                    overdueMilestones: projectProgress.overdueCount,
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
            );

            return (
              <ClientStrategy
                clientId={client.id}
                companyName={client.companyName}
                progress={progress}
                sections={sections}
                goals={client.strategyGoals.map((goal) => ({
                  id: goal.id,
                  title: goal.title,
                  category: goal.category ?? "",
                  metric: goal.metric ?? "",
                  baseline: goal.baseline ?? "",
                  target: goal.target ?? "",
                  targetDate: goal.targetDate?.toISOString().slice(0, 10) ?? "",
                  priority: goal.priority,
                  status: goal.status,
                  ownerId: goal.ownerId,
                  notes: goal.notes ?? "",
                }))}
                audiences={client.strategyAudiences.map((audience) => ({
                  id: audience.id,
                  tier: audience.tier,
                  name: audience.name,
                  location: audience.location ?? "",
                  attributes: audience.attributes ?? "",
                  needs: audience.needs ?? "",
                  painPoints: audience.painPoints ?? "",
                  buyingTriggers: audience.buyingTriggers ?? "",
                  objections: audience.objections ?? "",
                  decisionMakers: audience.decisionMakers ?? "",
                  channels: audience.channels ?? "",
                  notes: audience.notes ?? "",
                }))}
                valueProp={{
                  statement: client.strategyValueProp?.statement ?? "",
                  offer: client.strategyValueProp?.offer ?? "",
                  primaryOutcome: client.strategyValueProp?.primaryOutcome ?? "",
                  differentiators: client.strategyValueProp?.differentiators ?? [],
                  proofPoints: client.strategyValueProp?.proofPoints ?? "",
                  guarantees: client.strategyValueProp?.guarantees ?? "",
                  objections: client.strategyValueProp?.objections ?? "",
                  positioningStatement:
                    client.strategyValueProp?.positioningStatement ?? "",
                  competitorNotes: client.strategyValueProp?.competitorNotes ?? "",
                }}
                roadmap={client.roadmapPhases.map((phase) => ({
                  key: phase.key,
                  status: phase.status,
                  ownerName: phase.owner?.name ?? null,
                  targetDate: phase.targetDate?.toISOString() ?? null,
                  completedAt: phase.completedAt?.toISOString() ?? null,
                }))}
                assets={client.assets.map((asset) => ({
                  id: asset.id,
                  name: asset.name,
                  type: asset.type,
                  status: asset.status,
                  fileUrl: asset.fileUrl,
                }))}
                notes={client.clientNotes
                  .filter((note) => note.category === "STRATEGY")
                  .map((note) => ({
                    id: note.id,
                    body: note.body,
                    authorName: note.author?.name ?? null,
                    createdAt: note.createdAt.toISOString(),
                  }))}
                intake={{
                  exists: form !== null,
                  status: form?.status ?? "NOT_SENT",
                  sentAt: form?.sentAt?.toISOString() ?? null,
                  viewedAt: form?.viewedAt?.toISOString() ?? null,
                  submittedAt: form?.submittedAt?.toISOString() ?? null,
                  percent: intakeProgress.percent,
                  missingRequired: intakeProgress.missingRequired,
                  recipientEmail: client.contactEmail,
                }}
                a2p={a2pSummary}
                users={options.users.map((member) => ({
                  id: member.id,
                  name: member.name,
                }))}
                briefUpdatedAt={client.strategyBrief?.updatedAt.toISOString() ?? null}
                briefAuthorName={client.strategyBrief?.author?.name ?? null}
                nextMilestone={
                  upcoming ? { name: upcoming.name, dueAt: upcoming.dueAt } : null
                }
                canEdit={canManageClient}
                serverNow={new Date().toISOString()}
                timezone={client.timezone}
                intakeWorkspace={intakeWorkspace}
                briefWorkspace={briefWorkspace}
                projectsWorkspace={projectsWorkspace}
              />
            );
          })(),

          tasks: (
            <ClientWork
              clientId={client.id}
              companyName={client.companyName}
              timezone={client.timezone}
              serverNow={new Date().toISOString()}
              viewer={{
                id: actor.id,
                canEdit: can(actor, "workItems.assign"),
                canReviewAny: can(actor, "workItems.review"),
                canArchive: can(actor, "workItems.assign"),
                canDelete: can(actor, "clients.delete"),
                canAssign: can(actor, "workItems.assign"),
              }}
              assignees={options.users.map((member) => ({
                id: member.id,
                name: member.name,
              }))}
              /*
               * The same EmployeeTask rows My Work reads, narrowed field by
               * field on the way to the browser. Deleted work is left out;
               * archived work is kept so the completed counts stay honest.
               */
              tasks={client.agencyTasks
                .filter((task) => !task.deletedAt)
                .map((task) => ({
                  id: task.id,
                  title: task.title,
                  status: task.status,
                  priority: task.priority,
                  category: task.category,
                  platform: task.platform,
                  recurrence: task.recurrence,
                  dueDate: task.dueDate.toISOString(),
                  startDate: task.startDate?.toISOString() ?? null,
                  createdAt: task.createdAt.toISOString(),
                  updatedAt: task.updatedAt.toISOString(),
                  submittedAt: task.submittedAt?.toISOString() ?? null,
                  completedAt: task.completedAt?.toISOString() ?? null,
                  approvedAt: task.approvedAt?.toISOString() ?? null,
                  archivedAt: task.archivedAt?.toISOString() ?? null,
                  estimatedHours: task.estimatedHours,
                  actualHours: task.actualHours,
                  note: task.note,
                  objective: task.objective,
                  completionCriteria: task.completionCriteria,
                  requiresApproval: task.requiresApproval,
                  kpi: task.kpi,
                  blocker: task.blocker,
                  requiredAssets: task.requiredAssets,
                  revisionNote: task.revisionNote,
                  evidenceUrl: task.evidenceUrl,
                  client: { id: client.id, companyName: client.companyName },
                  project: task.project,
                  assignedTo: task.assignedTo
                    ? { id: task.assignedTo.id, name: task.assignedTo.name }
                    : null,
                  createdBy: task.createdBy,
                  reviewer: task.reviewer,
                  approvedBy: task.approvedBy,
                  commentCount: task._count.comments,
                  latestEodDate: task.eodEntries[0]?.entryDate.toISOString() ?? null,
                  reportedProgress: task.eodEntries[0]?.progressPercent ?? null,
                  unmetDependencies: task.blockedBy.filter(
                    (link) =>
                      !["DONE", "APPROVED"].includes(link.prerequisiteTask.status),
                  ).length,
                }))}
              /*
               * Progress stays the milestone figure the Projects view already
               * shows, so the two cannot disagree. The task counts beside it
               * are a different fact and are labelled as one.
               */
              projects={client.projects.map((project) => {
                const owned = client.agencyTasks.filter(
                  (task) => task.projectId === project.id && !task.deletedAt,
                );
                const progress = deriveProjectProgress(project.milestones);

                return {
                  id: project.id,
                  name: project.name,
                  status: project.status,
                  ownerName: project.projectManager?.name ?? null,
                  progress: progress.percentComplete,
                  taskCount: owned.length,
                  completedCount: owned.filter((task) =>
                    ["DONE", "APPROVED"].includes(task.status),
                  ).length,
                  overdueCount: owned.filter(
                    (task) =>
                      !["DONE", "APPROVED", "CANCELLED"].includes(task.status)
                      && task.dueDate < new Date(),
                  ).length,
                  blockedCount: owned.filter((task) => task.status === "BLOCKED").length,
                  nextMilestone: progress.nextMilestone
                    ? {
                        // The helper names it; the date comes off the milestone.
                        name: progress.nextMilestone,
                        dueAt:
                          project.milestones
                            .find((milestone) => milestone.name === progress.nextMilestone)
                            ?.dueDate?.toISOString() ?? null,
                      }
                    : null,
                };
              })}
              eodEntries={clientEod.map((entry) => ({
                id: entry.id,
                taskId: entry.task.id,
                taskTitle: entry.task.title,
                userName: entry.author?.name ?? "Someone",
                entryDate: entry.entryDate.toISOString(),
                hoursWorked: entry.hoursSpent,
                progressNote: entry.summary,
                blockers: entry.blockers,
                nextAction: entry.nextSteps,
                createdAt: entry.createdAt.toISOString(),
              }))}
              activity={activity.map((entry) => ({
                id: entry.id,
                action: entry.action,
                actorName: entry.actor?.name ?? null,
                createdAt: entry.createdAt.toISOString(),
              }))}
            />
          ),

          journey: journeyDetail ? (
            <ClientJourneyView
              detail={journeyDetail}
              nowIso={new Date().toISOString()}
              owners={options.users.map((member) => ({
                id: member.id,
                name: member.name,
              }))}
              embedded
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Journey</CardTitle>
                <CardDescription>
                  This account has no journey record to show yet.
                </CardDescription>
              </CardHeader>
            </Card>
          ),

          /*
           * Approvals: one page, one view of each record.
           *
           * Three workspaces used to stack here - QA plans, approval records
           * and launches - each honest on its own and none of them adding up
           * to an answer. Worse, the summary card added above them meant the
           * tab rendered a reading of the records and a second copy of the
           * records underneath it.
           *
           * They are gone rather than hidden. Every endpoint they posted to
           * is untouched and the cards now open those working surfaces
           * directly, so the same rows are edited through the same services
           * with one fewer place to look.
           */
          quality: <ClientApprovalWorkspace {...approvalWorkspaceProps} />,

          reports: (
            <div className="space-y-6">
              {/*
                * Reports & Health.
                *
                * One workspace replacing the reporting and health panels that
                * used to stack here: they answered the same question from two
                * directions and neither could see the other, so an account
                * could show a healthy score beside a report nobody sent.
                *
                * The growth, offboarding and invoice sections below are not
                * duplicates of it and stay where they are - this card links
                * down to the growth workspace rather than restating it.
                */}
              <ClientReportsHealth {...reportsHealthProps} />

              <div id="growth-workspace" className="scroll-mt-24">
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
              </div>
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
