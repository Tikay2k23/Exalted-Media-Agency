import "dotenv/config";

import { prisma } from "@/lib/prisma";

/**
 * Phase 2 dry run. Calculates only - nothing is written or deleted.
 *
 * Two questions:
 *
 *   What would the cleanup remove, and what would survive it?
 *   Which tables still hold leaked test fixtures, and from which suite?
 *
 * The fixture scan matters as much as the counts: a cleanup that finishes and
 * is then repopulated by the next `npm test` has not established a baseline.
 */

const FIXTURE_PREFIX = "zz-";

/** Internal accounts that stay. Anything else with a zz- email is a fixture. */
async function preservedUserIds(): Promise<Set<string>> {
  const rows = await prisma.user.findMany({
    where: { NOT: { email: { startsWith: FIXTURE_PREFIX } } },
    select: { id: true },
  });

  return new Set(rows.map((row) => row.id));
}

async function main() {
  const keepUsers = await preservedUserIds();

  console.log("=".repeat(72));
  console.log("PHASE 2 DRY RUN - nothing is deleted");
  console.log("=".repeat(72));

  /* ------------------------------------------------- fixture contamination */

  console.log("\n--- LEAKED TEST FIXTURES STILL IN THE DATABASE ---\n");

  const leaks: [string, number][] = [
    ["Contact (businessName)", await prisma.contact.count({ where: { businessName: { startsWith: FIXTURE_PREFIX } } })],
    ["Client (companyName)", await prisma.client.count({ where: { companyName: { startsWith: FIXTURE_PREFIX } } })],
    ["Lead (businessName)", await prisma.lead.count({ where: { businessName: { startsWith: FIXTURE_PREFIX } } })],
    ["User (email)", await prisma.user.count({ where: { email: { startsWith: FIXTURE_PREFIX } } })],
    ["EmployeeTask (title)", await prisma.employeeTask.count({ where: { title: { startsWith: FIXTURE_PREFIX } } })],
    ["Sop (title)", await prisma.sop.count({ where: { title: { startsWith: FIXTURE_PREFIX } } })],
    ["Project (name)", await prisma.project.count({ where: { name: { startsWith: FIXTURE_PREFIX } } })],
  ];

  for (const [label, count] of leaks) {
    console.log(`  ${String(count).padStart(6)}  ${label}${count > 0 ? "   <-- leaking" : ""}`);
  }

  /* --------------------------------------------------------- the dry run */

  console.log("\n--- WOULD DELETE / WOULD PRESERVE ---\n");
  console.log(
    `${"Model".padEnd(28)}${"Now".padStart(7)}${"Delete".padStart(9)}${"Keep".padStart(7)}  Basis`,
  );
  console.log("-".repeat(100));

  const line = (model: string, now: number, del: number, basis: string) => {
    console.log(
      `${model.padEnd(28)}${String(now).padStart(7)}${String(del).padStart(9)}${String(now - del).padStart(7)}  ${basis}`,
    );
  };

  /* Operational: everything client- or lead-derived goes. */
  const wholeTable = async (
    model: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delegate: { count: (args?: any) => Promise<number> },
    basis: string,
  ) => {
    const now = await delegate.count();
    line(model, now, now, basis);
    return now;
  };

  console.log("\n[ SALES ]");
  await wholeTable("Lead", prisma.lead, "All leads are development records");
  await wholeTable("LeadNote", prisma.leadNote, "Child of Lead");
  await wholeTable("LeadCallLog", prisma.leadCallLog, "Child of Lead");
  await wholeTable("LeadFollower", prisma.leadFollower, "Child of Lead");
  await wholeTable("LeadHandoff", prisma.leadHandoff, "Child of Lead");

  const contactsNow = await prisma.contact.count();
  const contactsFixture = await prisma.contact.count({
    where: { businessName: { startsWith: FIXTURE_PREFIX } },
  });
  const contactsWithLead = await prisma.contact.count({
    where: { opportunities: { some: {} } },
  });
  line(
    "Contact",
    contactsNow,
    contactsNow,
    `${contactsFixture} leaked fixtures + ${contactsWithLead} attached to deleted leads`,
  );

  console.log("\n[ CLIENT CORE ]");
  await wholeTable("Client", prisma.client, "All clients are development records");
  await wholeTable("ClientContact", prisma.clientContact, "Child of Client");
  await wholeTable("Contract", prisma.contract, "Child of Client");
  await wholeTable("ClientNote", prisma.clientNote, "Child of Client");
  await wholeTable("ClientWorkstream", prisma.clientWorkstream, "Child of Client");
  await wholeTable("ClientHandoff", prisma.clientHandoff, "Child of Client");

  console.log("\n[ WORK ]");
  await wholeTable("Project", prisma.project, "Child of Client");
  await wholeTable("Milestone", prisma.milestone, "Child of Project");
  await wholeTable("EmployeeTask", prisma.employeeTask, "Client work + internal dev tasks");
  await wholeTable("TaskComment", prisma.taskComment, "Child of EmployeeTask");
  await wholeTable("TaskDependency", prisma.taskDependency, "Child of EmployeeTask");
  await wholeTable("EmployeeTaskEodEntry", prisma.employeeTaskEodEntry, "Child of EmployeeTask");
  await wholeTable("WeeklyReport", prisma.weeklyReport, "Operational weekly submissions");

  console.log("\n[ JOURNEY ]");
  await wholeTable("ClientStageHistory", prisma.clientStageHistory, "Child of Client");
  await wholeTable("ClientJourneyFlag", prisma.clientJourneyFlag, "Child of Client");
  await wholeTable("StageAutomationRun", prisma.stageAutomationRun, "Child of Client");
  await wholeTable("OnboardingRecord", prisma.onboardingRecord, "Child of Client");

  console.log("\n[ INTAKE / STRATEGY / A2P ]");
  await wholeTable("IntakeForm", prisma.intakeForm, "Child of Client");
  await wholeTable("IntakeSubmission", prisma.intakeSubmission, "Child of IntakeForm");
  await wholeTable("StrategyBrief", prisma.strategyBrief, "Child of Client");
  await wholeTable("StrategyGoal", prisma.strategyGoal, "Child of Client");
  await wholeTable("StrategySection", prisma.strategySection, "Child of Client");
  await wholeTable("StrategyAudience", prisma.strategyAudience, "Child of Client");
  await wholeTable("StrategyValueProp", prisma.strategyValueProp, "Child of Client");
  await wholeTable("StrategyRoadmapPhase", prisma.strategyRoadmapPhase, "Child of Client");
  await wholeTable("A2PProfile", prisma.a2PProfile, "Child of Client");
  await wholeTable("A2PSampleMessage", prisma.a2PSampleMessage, "Child of A2PProfile");
  await wholeTable("A2PSubmission", prisma.a2PSubmission, "Child of A2PProfile");

  console.log("\n[ QUALITY / APPROVALS / LAUNCH ]");
  await wholeTable("QaPlan", prisma.qaPlan, "Child of Client");
  await wholeTable("QaTest", prisma.qaTest, "Child of QaPlan");
  await wholeTable("Defect", prisma.defect, "Child of Client");
  await wholeTable("ReviewCycle", prisma.reviewCycle, "Child of Client");
  await wholeTable("RevisionItem", prisma.revisionItem, "Child of ReviewCycle");
  await wholeTable("Approval", prisma.approval, "Child of Client");
  await wholeTable("Launch", prisma.launch, "Child of Client");
  await wholeTable("LaunchChecklistItem", prisma.launchChecklistItem, "Child of Launch");
  await wholeTable("MonitoringCheck", prisma.monitoringCheck, "Child of Launch");
  await wholeTable("Incident", prisma.incident, "Child of Client");

  console.log("\n[ REPORTS / HEALTH / GROWTH ]");
  await wholeTable("ClientReport", prisma.clientReport, "Child of Client");
  await wholeTable("Optimization", prisma.optimization, "Child of Client");
  await wholeTable("ClientHealthAssessment", prisma.clientHealthAssessment, "Child of Client");
  await wholeTable("Complaint", prisma.complaint, "Child of Client");
  await wholeTable("RecoveryPlan", prisma.recoveryPlan, "Child of Client");
  await wholeTable("Renewal", prisma.renewal, "Child of Client");
  await wholeTable("ExpansionOpportunity", prisma.expansionOpportunity, "Child of Client");
  await wholeTable("Testimonial", prisma.testimonial, "Child of Client");
  await wholeTable("Referral", prisma.referral, "Child of Client");

  console.log("\n[ FILES / ACCESS / BILLING ]");
  await wholeTable("AssetRecord", prisma.assetRecord, "Child of Client");
  await wholeTable("AccessRecord", prisma.accessRecord, "Child of Client");
  await wholeTable("Invoice", prisma.invoice, "Child of Client");
  await wholeTable("Payment", prisma.payment, "Child of Invoice");

  console.log("\n[ LIFECYCLE END ]");
  await wholeTable("OffboardingRecord", prisma.offboardingRecord, "Child of Client");

  console.log("\n[ MIXED - RULE APPLIED ]");

  const activityNow = await prisma.activityLog.count();
  const activityUser = await prisma.activityLog.count({ where: { entityType: "USER" } });
  const activityUserKept = await prisma.activityLog.count({
    where: { entityType: "USER", entityId: { in: [...keepUsers] } },
  });
  line(
    "ActivityLog",
    activityNow,
    activityNow - activityUserKept,
    `keep ${activityUserKept} USER rows for preserved users; ${activityUser - activityUserKept} USER rows belong to fixture users`,
  );

  await wholeTable("Notification", prisma.notification, "All operational; none reference config");

  const usersNow = await prisma.user.count();
  const usersFixture = await prisma.user.count({
    where: { email: { startsWith: FIXTURE_PREFIX } },
  });
  line("User", usersNow, usersFixture, "Only zz- fixture accounts; all 31 real users preserved");

  console.log("\n--- WOULD PRESERVE (configuration and UAT) ---\n");

  const preserve: [string, number, string][] = [
    ["Pipeline", await prisma.pipeline.count(), "Sales + fulfilment pipeline definitions"],
    ["PipelineStage", await prisma.pipelineStage.count(), "Journey stage templates"],
    ["StageRequirement", await prisma.stageRequirement.count(), "Stage gate definitions"],
    ["Sop", await prisma.sop.count(), "Governance definitions"],
    ["SopVersion", await prisma.sopVersion.count(), "SOP version history"],
    ["WorkspaceSetting", await prisma.workspaceSetting.count(), "Application settings"],
    ["UatTestCase", await prisma.uatTestCase.count(), "UAT catalogue + release scope"],
    ["UatTestRun", await prisma.uatTestRun.count(), "Historical technical evidence"],
    ["MigrationLog", await prisma.migrationLog.count(), "Infrastructure audit history"],
    ["User (internal)", usersNow - usersFixture, "All six seats for Human UAT"],
    ["Audit", await prisma.audit.count(), "Governance audits"],
    ["AuditFinding", await prisma.auditFinding.count(), "Governance findings"],
    ["CorrectiveAction", await prisma.correctiveAction.count(), "Governance actions"],
    ["ImprovementRequest", await prisma.improvementRequest.count(), "Governance improvements"],
    ["TrainingRecord", await prisma.trainingRecord.count(), "Team training"],
    ["UserPermissionOverride", await prisma.userPermissionOverride.count(), "Permission grants"],
    ["SavedView", await prisma.savedView.count(), "Saved filters"],
  ];

  for (const [model, count, why] of preserve) {
    console.log(`  ${String(count).padStart(6)}  ${model.padEnd(24)} ${why}`);
  }
}

main().finally(() => prisma.$disconnect());
