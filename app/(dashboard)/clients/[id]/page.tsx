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
import { ClientActivity } from "@/components/clients/client-activity";
import { ClientBrief } from "@/components/clients/client-brief";
import { ClientGrowth } from "@/components/clients/client-growth";
import { ClientHealth } from "@/components/clients/client-health";
import { ClientOffboarding } from "@/components/clients/client-offboarding";
import { ClientIntake } from "@/components/clients/client-intake";
import { ClientInvoices } from "@/components/clients/client-invoices";
import { ClientProjects } from "@/components/clients/client-projects";
import { ClientApprovalWorkspace } from "@/components/clients/client-approval-workspace";
import { ClientReportsHealth } from "@/components/clients/client-reports-health";
import { ClientStatusSelect } from "@/components/clients/client-status-select";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  daysSinceAssessment,
  isComplaintOpen,
  isRecoveryPlanLive,
} from "@/lib/success/health-service";
import { accountHealth } from "@/lib/success/account-health";
import { moreBadges } from "@/lib/clients/more-badges";
import { journeyHealth } from "@/lib/journey/journey-health";
import { stageClock } from "@/lib/journey/client-detail";
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
import { formatEnumLabel } from "@/lib/utils";

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
   * The fuller record, for the Activity & Notes workspace.
   *
   * Wider than the twenty rows the Overview shows, and not only the rows
   * logged against the client: work is logged against the task, so a page
   * that only read CLIENT rows would show an account where no task ever
   * moved. The task ids come from the rows this page already loaded.
   */
  const clientTaskIds = client.agencyTasks.map((task) => task.id);

  const activityFeed = await prisma.activityLog.findMany({
    where: {
      OR: [
        { entityType: "CLIENT", entityId: id },
        ...(clientTaskIds.length > 0
          ? [{ entityType: "EMPLOYEE_TASK" as const, entityId: { in: clientTaskIds } }]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      action: true,
      entityType: true,
      fieldName: true,
      previousValue: true,
      newValue: true,
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

  /*
   * The same rows, whole, for the workspace the summary tile opens.
   *
   * Mapped here rather than fetched again: the tab already loads every
   * optimization on the account, and a second query for the same rows would
   * be a second answer to the same question.
   */
  const optimizationDetails = client.optimizations.map((entry) => ({
    id: entry.id,
    title: entry.title,
    platform: entry.platform,
    observedProblem: entry.observedProblem,
    proposedChange: entry.proposedChange,
    hypothesis: entry.hypothesis,
    evidence: entry.evidence,
    expectedMetric: entry.expectedMetric,
    previousSetting: entry.previousSetting,
    newSetting: entry.newSetting,
    metricBefore: entry.metricBefore,
    metricAfter: entry.metricAfter,
    notes: entry.notes,
    priority: entry.priority as string,
    serviceType: entry.serviceType as string | null,
    decision: entry.decision as string,
    result: entry.result,
    startDate: entry.startDate?.toISOString() ?? null,
    endDate: entry.endDate?.toISOString() ?? null,
    cancelledAt: entry.cancelledAt?.toISOString() ?? null,
    cancelledReason: entry.cancelledReason,
    completedAt: entry.completedAt?.toISOString() ?? null,
    ownerId: entry.ownerId,
    ownerName: entry.owner?.name ?? null,
    createdByName: entry.createdBy?.name ?? null,
    completedByName: entry.completedBy?.name ?? null,
    cancelledByName: entry.cancelledBy?.name ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    task: entry.task
      ? {
          id: entry.task.id,
          title: entry.task.title,
          status: entry.task.status as string,
          dueDate: entry.task.dueDate.toISOString(),
        }
      : null,
  }));

  /*
   * What an optimization is allowed to point at.
   *
   * Services are the ones this account actually buys - the headline service
   * plus whatever its projects deliver - so the form cannot name one they do
   * not have. Tasks are this client's existing work: linking one is allowed,
   * creating one from here is not, because the task system owns that.
   */
  const clientServiceTypes = [
    ...new Set([client.serviceType, ...client.projects.map((project) => project.serviceType)]),
  ];
  const optimizationServices = serviceTypeOptions
    .filter((option) => clientServiceTypes.includes(option))
    .map((option) => ({ value: option as string, label: formatEnumLabel(option) }));

  const optimizationTasks = client.agencyTasks
    .filter((task) => task.status !== "DONE" && task.status !== "CANCELLED")
    .slice(0, 50)
    .map((task) => ({ id: task.id, title: task.title }));

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
    /* The database's count, so a bounded task list cannot change the number. */
    overdueTasks: client.taskTotals.overdue,
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

  /*
   * The journey's own picture, fetched here because account health reads it.
   * One call, shared by the health calculation and the Journey tab below.
   */
  const { detail: journeyDetail } = await getJourneyClientDetail(actor, id);

  /*
   * Account health, read off the systems that already answered.
   *
   * Every number here belongs to somebody else: the journey scores itself,
   * the approval gate decides whether anything is in the way, the tasks know
   * what is late, the invoices know what is unpaid. This weighs their answers
   * so the account has one overall figure instead of five pages disagreeing.
   *
   * Journey health is the journey's own calculation, called with the journey's
   * own inputs - not a copy of its rules.
   */
  const healthNow = new Date();

  const journeyStageClock = journeyDetail ? stageClock(journeyDetail.account, healthNow) : null;
  const oldestWait = journeyDetail
    ? journeyDetail.flags
        .filter((flag) => flag.kind === "WAITING_ON_CLIENT" && !flag.resolvedAt)
        .map((flag) => new Date(flag.raisedAt).getTime())
        .sort((a, b) => a - b)[0]
    : undefined;

  const journeyScore =
    journeyDetail && journeyStageClock
      ? journeyHealth({
          requirements: journeyDetail.account.requirements,
          flags: journeyDetail.flags,
          tasks: journeyDetail.tasks.map((task) => ({
            status: task.status,
            dueDate: task.dueDate,
          })),
          dayInStage: journeyStageClock.day,
          targetDays: journeyStageClock.targetDays,
          waitingDays:
            oldestWait === undefined
              ? null
              : Math.max(1, Math.round((healthNow.getTime() - oldestWait) / 86_400_000)),
          now: healthNow,
        })
      : null;


  const computedHealth = accountHealth({
    journey: journeyScore ? { score: journeyScore.score, label: journeyScore.label } : null,
    /* The gate's own score and its own blockers, not a second reading of them. */
    approvals: {
      score: approvalGateState.healthScore,
      blockers: approvalGateState.blockers,
    },
    /*
     * Counted by the database, not by measuring an array the page happens to
     * be holding. The task list is a bounded window; these are the account.
     */
    delivery: {
      total: client.taskTotals.total,
      overdue: client.taskTotals.overdue,
      blocked: client.taskTotals.blocked,
    },
    performance: {
      reportsDue: reportRows.length,
      reportsOverdue: reportRows.filter(
        (report) =>
          !report.sentAt && report.dueAt !== null && Date.parse(report.dueAt) < healthNow.getTime(),
      ).length,
      goalsTracked: goalPicture.length,
      goalsBehind: goalPicture.filter(
        (goal) => goal.state === "BEHIND" || goal.state === "AT_RISK",
      ).length,
    },
    communication: {
      openComplaints: openComplaintCount,
      waitingDays:
        oldestWait === undefined
          ? null
          : Math.max(1, Math.round((healthNow.getTime() - oldestWait) / 86_400_000)),
      /* Anything ever said either way. Silence with no history is not good news. */
      hasHistory:
        client.complaints.length > 0
        || (journeyDetail?.flags.length ?? 0) > 0
        || client.healthAssessments.length > 0,
    },
    /* Null rather than a score: a seat that cannot see money has not seen good money. */
    financial: canViewFinance
      ? {
          total: client.invoices.length,
          overdueInvoices: client.invoices.filter(
            (invoice) =>
              invoice.status !== "PAID"
              && invoice.dueAt !== null
              && invoice.dueAt.getTime() < healthNow.getTime(),
          ).length,
          failedInvoices: client.invoices.filter((invoice) => invoice.status === "FAILED").length,
        }
      : null,
    relationship: latestAssessment
      ? {
          satisfactionScore: latestAssessment.satisfactionScore,
          renewalProbability: latestAssessment.renewalProbability,
          cancellationThreat: latestAssessment.cancellationThreat,
        }
      : null,
  });

  /*
   * The health workspace, handed to the card as a slot.
   *
   * Recording an assessment, raising a complaint and writing a recovery plan
   * only ever lived here. The summary card measures health; it cannot also be
   * the only place that shows it, or the colour has nobody's name against it
   * again. Same component, same endpoints, opened from the Client Health card.
   */
  const healthWorkspace = (
    <ClientHealth
      clientId={client.id}
      canManage={can(actor, "health.manage")}
      currentStatus={client.healthStatus}
      computed={computedHealth}
      daysSinceAssessment={daysSinceAssessment(client.healthAssessments[0]?.assessedAt ?? null)}
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
  );

  /*
   * The renewal and growth workspace, which is now its own place under More.
   *
   * It has moved twice: it used to stack under Reports, then opened in a
   * modal from the summary card there. Both made the full workspace something
   * you reached through a page about measurement. Reports keeps the summary
   * and links here.
   */
  const growthWorkspace = (() => {
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
  })();

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
    optimizationDetails,
    services: optimizationServices,
    tasks: optimizationTasks,
    /*
     * The metrics offered as suggestions rather than a fixed list. There is no
     * KPI table in this application, so a closed dropdown here would be an
     * invented catalogue - these are the ones the agency actually names, and
     * anything else can still be typed.
     */
    metrics: [
      "Conversion rate",
      "Traffic",
      "Lead volume",
      "Form submission rate",
      "Response time",
      "Cost per lead",
      "Cost per acquisition",
      "Show rate",
      "Close rate",
    ],
    actorId: actor.id,
    healthWorkspace,
    permissions: {
      canReport: can(actor, "reporting.client"),
      canManageHealth: can(actor, "health.manage"),
      canViewFinance,
      /* The seats that may move somebody else's optimization, not only theirs. */
      canManageAllWork: can(actor, "clients.view.all"),
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
        badges={moreBadges({
          /*
            * Counted from the rows this page already holds, so the badge and
            * the panel behind it cannot disagree.
            */
          missingCriticalAccess: client.accessRecords.filter(
            (record) =>
              record.isCritical
              && !["GRANTED", "TESTED", "NOT_APPLICABLE"].includes(record.status),
          ).length,
          accessIssues: client.accessRecords.filter((record) =>
            ["INSUFFICIENT_PERMISSIONS", "FAILED"].includes(record.status),
          ).length,
          /* Null, not zero: a seat that cannot see money is not owed nothing. */
          overdueInvoices: canViewFinance
            ? client.invoices.filter(
                (invoice) =>
                  invoice.status !== "PAID"
                  && invoice.dueAt !== null
                  && invoice.dueAt.getTime() < healthNow.getTime(),
              ).length
            : null,
          daysToRenewal: renewalRunway(
            client.renewals[0]?.renewalDate ?? client.renewalDate,
            healthNow,
          ).daysUntil,
          offboardingInFlight:
            client.offboarding !== null && !isOffboardingComplete(client.offboarding),
        })}
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

          /*
           * Billing & Payments, behind More.
           *
           * The same invoice rows Account reads its contract value from -
           * one commercial record, shown where the money work happens rather
           * than copied into a second one. Hidden entirely without the
           * finance permission, which the component checks again server-side
           * before it will change anything.
           */
          billing: canViewFinance ? (
            /* Named, because the Account quick actions link straight to it. */
            <div id="client-invoices" className="scroll-mt-24">
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
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Billing & Payments</CardTitle>
                <CardDescription>
                  Amounts on this account are owner business. The stage gate still tells you
                  whether payment is outstanding, without showing what it is.
                </CardDescription>
              </CardHeader>
            </Card>
          ),

          /*
           * Renewal & Growth, behind More.
           *
           * Reports keeps its summary card; this is the workspace it
           * summarises. Same component, same endpoints - it opened in a modal
           * from that card, which made the full workspace something you could
           * only reach through a page about measurement.
           */
          renewal: growthWorkspace,

          /*
           * Offboarding, behind More.
           *
           * Ending an account is its own job with its own checklist, and it
           * sat under Account beside the billing details, where nobody
           * looking to close a client would think to go.
           */
          offboarding: (() => {
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
          })(),

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

          /*
           * Reports & Health: one page, and only this page.
           *
           * Five panels used to stack under this tab - reporting, health,
           * growth, offboarding and invoices. Replacing the first two and
           * leaving the other three below the new summary was the mistake:
           * scrolling still showed the old page, because it was still there.
           *
           * Nothing was thrown away. Growth is handed to the card as a slot
           * and opens behind View growth strategy; billing and offboarding
           * moved to Account, which already owns the contract value they sit
           * beside. Reporting and health are gone, replaced.
           */
          reports: <ClientReportsHealth {...reportsHealthProps} />,

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

          /*
           * Activity & Notes, behind More.
           *
           * The tab used to show one free-text field and the stage list, while
           * the activity log every service in this application writes to was
           * not on the page at all. Same rows, now shown, filterable and
           * searchable, with the note system that already existed attached.
           */
          activity: (
            <ClientActivity
              clientId={client.id}
              canAddNote={canManageClient}
              entries={activityFeed.map((entry) => ({
                id: entry.id,
                action: entry.action,
                entityType: entry.entityType as string,
                fieldName: entry.fieldName,
                previousValue: entry.previousValue,
                newValue: entry.newValue,
                actorName: entry.actor?.name ?? null,
                createdAt: entry.createdAt.toISOString(),
              }))}
              notes={client.clientNotes.map((note) => ({
                id: note.id,
                body: note.body,
                category: note.category as string,
                authorName: note.author?.name ?? null,
                createdAt: note.createdAt.toISOString(),
              }))}
              stageHistory={client.stageHistory.map((entry) => ({
                id: entry.id,
                fromStage: entry.fromStage?.name ?? null,
                toStage: entry.toStage.name,
                changedByName: entry.changedBy?.name ?? null,
                changedAt: entry.changedAt.toISOString(),
                note: entry.note,
              }))}
            />
          ),

          integrations: (
            <ClientIntegrations clientId={client.id} companyName={client.companyName} />
          ),
        }}
      />
    </div>
  );
}
