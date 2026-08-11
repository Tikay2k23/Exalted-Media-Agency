import {
  AccessMethod,
  AccessPlatform,
  AccessStatus,
  ApprovalType,
  AuditType,
  CertificationLevel,
  ComplaintStatus,
  ComplianceStatus,
  CorrectiveActionStatus,
  ImprovementPriority,
  ImprovementStatus,
  TrainingStatus,
  ExpansionStatus,
  ExpansionType,
  OffboardingReason,
  OffboardingStatus,
  OptimizationDecision,
  RecoveryPlanStatus,
  ReferralStatus,
  RenewalStage,
  ReportType,
  TestimonialFormat,
  TestimonialStatus,
  CallOutcome,
  ChecklistItemStatus,
  DefectSeverity,
  DefectStatus,
  ClientStatus,
  Department,
  EmployeeTaskStatus,
  HealthStatus,
  LaunchStatus,
  LaunchType,
  LeadSource,
  LeadStatus,
  MonitoringResult,
  QaTestStatus,
  PaymentMethod,
  PaymentStatus,
  ProjectStatus,
  RiskLevel,
  Role,
  ServiceType,
  TaskCategory,
  TaskPlatform,
  TaskPriority,
  TaskRecurrence,
} from "@prisma/client";
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const userFormSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  role: z.nativeEnum(Role),
  department: z.nativeEnum(Department),
  jobTitle: z.string().max(80).optional().or(z.literal("")),
  weeklyCapacityHours: z.coerce.number().int().min(1).max(80),
  password: z.string().min(8),
  isActive: z.coerce.boolean().default(true),
});

const avatarSchema = z
  .string()
  .max(2_800_000)
  .refine((value) => value === "" || value.startsWith("data:image/"), {
    message: "Avatar must be a valid image upload.",
  });

export const profileUpdateSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  jobTitle: z.string().max(80).optional().or(z.literal("")),
  avatarUrl: avatarSchema.optional().nullable(),
});

export const clientFormSchema = z.object({
  clientName: z.string().min(2).max(80),
  companyName: z.string().min(2).max(120),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(40).optional().or(z.literal("")),
  assignedUserId: z.string().optional().or(z.literal("")),
  status: z.nativeEnum(ClientStatus),
  serviceType: z.nativeEnum(ServiceType),
  currentStageId: z.string().min(1),
  notes: z.string().max(3000).optional().or(z.literal("")),
});

export const clientStatusUpdateSchema = z.object({
  status: z.nativeEnum(ClientStatus),
});

export const stageOverrideSchema = z.object({
  /// Long enough that "override" or "asap" cannot pass as a justification.
  reason: z.string().min(10).max(1000),
  riskAcknowledged: z.literal(true, {
    message: "The risk of bypassing this requirement must be explicitly acknowledged.",
  }),
});

export const pipelineMoveSchema = z.object({
  clientId: z.string().min(1),
  stageId: z.string().min(1),
  note: z.string().max(500).optional().or(z.literal("")),
  override: stageOverrideSchema.optional(),
});

export const employeeTaskFormSchema = z.object({
  title: z.string().min(2).max(120),
  note: z.string().optional().or(z.literal("")),
  assignedToId: z.string().min(1),
  dueDate: z.string().min(1),
  priority: z.nativeEnum(TaskPriority),
  category: z.nativeEnum(TaskCategory),
  estimatedHours: z.coerce.number().int().min(1).max(40),
  status: z.nativeEnum(EmployeeTaskStatus).default(EmployeeTaskStatus.TODO),
  clientId: z.string().optional().or(z.literal("")),

  // The detail that turns "do the thing" into something somebody can act on
  // without asking three questions first. All optional: a quick task should
  // stay quick.
  projectId: z.string().optional().or(z.literal("")),
  platform: z.nativeEnum(TaskPlatform).optional().nullable(),
  objective: z.string().max(300).optional().or(z.literal("")),
  completionCriteria: z.string().max(2000).optional().or(z.literal("")),
  reviewerId: z.string().optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  requiredAssets: z.string().max(4000).optional().or(z.literal("")),
  kpi: z.string().max(300).optional().or(z.literal("")),
  blocker: z.string().max(1000).optional().or(z.literal("")),
  recurrence: z.nativeEnum(TaskRecurrence).optional(),
  /**
   * Sent by the form so a double-click cannot create the task twice. The
   * server treats a repeat within the dedupe window as the same submission.
   */
  submissionKey: z.string().max(80).optional().or(z.literal("")),
});

export const employeeTaskUpdateSchema = z.object({
  title: z.string().min(2).max(120).optional(),
  note: z.string().optional().or(z.literal("")),
  dueDate: z.string().min(1).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  category: z.nativeEnum(TaskCategory).optional(),
  estimatedHours: z.coerce.number().int().min(1).max(40).optional(),
  status: z.nativeEnum(EmployeeTaskStatus),
  clientId: z.string().optional().or(z.literal("")),
  assignedToId: z.string().optional().or(z.literal("")),
});

// --- Client account details ------------------------------------------------

/**
 * Partial update of the commercial and health fields on an account.
 *
 * Kept separate from `clientFormSchema` so satisfying one stage requirement
 * does not force someone to re-submit the entire account.
 */
export const clientDetailsSchema = z.object({
  assignedUserId: z.string().optional().or(z.literal("")),
  healthStatus: z.nativeEnum(HealthStatus).optional(),
  monthlyValue: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  contractStartDate: z.string().optional().or(z.literal("")),
  contractEndDate: z.string().optional().or(z.literal("")),
  renewalDate: z.string().optional().or(z.literal("")),
  currentBlocker: z.string().max(500).optional().or(z.literal("")),
  nextAction: z.string().max(500).optional().or(z.literal("")),
  nextActionDueAt: z.string().optional().or(z.literal("")),
});

export const clientContactSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  role: z.string().max(80).optional().or(z.literal("")),
  isPrimary: z.boolean().default(false),
  isDecisionMaker: z.boolean().default(false),
  isApprover: z.boolean().default(false),
  communicationPreference: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

// --- Strategy brief --------------------------------------------------------

const briefField = z.string().max(4000).optional().or(z.literal(""));

/**
 * Every field is optional so the brief can be saved half-written. Whether it
 * is complete enough to approve is decided in lib/strategy/brief-service.ts,
 * not here: partial saving and readiness are different questions.
 */
export const strategyBriefSchema = z.object({
  primaryGoal: briefField,
  successMetrics: briefField,
  targetAudience: briefField,
  mainOffer: briefField,
  serviceArea: briefField,
  callToAction: briefField,
  customerJourney: briefField,
  funnelStrategy: briefField,
  crmStrategy: briefField,
  advertisingStrategy: briefField,
  trackingStrategy: briefField,
  contentStrategy: briefField,
  technicalArchitecture: briefField,
  risks: briefField,
  dependencies: briefField,
  clientResponsibilities: briefField,
  agencyResponsibilities: briefField,
  timelineSummary: briefField,
});

export const briefRevisionSchema = z.object({
  reason: z.string().min(1).max(2000),
});

// --- Client approvals ------------------------------------------------------

export const clientApprovalSchema = z.object({
  type: z.nativeEnum(ApprovalType),
  subject: z.string().min(2).max(200),
  // Chosen from the account's contacts, never typed. The service checks the
  // contact belongs to this client and is authorized to approve.
  approverContactId: z.string().min(1),
  approvedAt: z.string().optional().or(z.literal("")),
  evidenceUrl: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  projectId: z.string().optional().or(z.literal("")),
});

export const approvalWithdrawalSchema = z.object({
  reason: z.string().min(1).max(2000),
});

// --- Client health, complaints and recovery --------------------------------

const score = z.number().int().min(0).max(100).nullable().optional();

export const healthAssessmentSchema = z.object({
  status: z.nativeEnum(HealthStatus),
  summary: z.string().min(1).max(2000),
  healthScore: score,
  satisfactionScore: score,
  renewalProbability: score,
  cancellationThreat: z.boolean().optional(),
  communicationStatus: z.string().max(200).optional().or(z.literal("")),
  paymentStatus: z.string().max(200).optional().or(z.literal("")),
  performanceStatus: z.string().max(200).optional().or(z.literal("")),
  clientParticipation: z.string().max(200).optional().or(z.literal("")),
});

export const complaintSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(4000),
  serviceArea: z.string().max(160).optional().or(z.literal("")),
  businessImpact: z.string().max(2000).optional().or(z.literal("")),
  evidenceUrl: z.string().max(500).optional().or(z.literal("")),
  ownerId: z.string().optional().or(z.literal("")),
  followUpAt: z.string().optional().or(z.literal("")),
});

export const complaintUpdateSchema = z.object({
  status: z.nativeEnum(ComplaintStatus).optional(),
  rootCause: z.string().max(2000).optional().or(z.literal("")),
  resolutionPlan: z.string().max(2000).optional().or(z.literal("")),
  clientCommunication: z.string().max(2000).optional().or(z.literal("")),
  finalOutcome: z.string().max(2000).optional().or(z.literal("")),
  ownerId: z.string().optional().or(z.literal("")),
  followUpAt: z.string().optional().or(z.literal("")),
});

// --- Guided client creation --------------------------------------------------

export const newClientSchema = z.object({
  companyName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(160),
  contactEmail: z.string().email().max(200),
  contactPhone: z.string().max(60).optional().or(z.literal("")),
  website: z.string().max(300).optional().or(z.literal("")),

  serviceType: z.nativeEnum(ServiceType),
  monthlyValue: z.number().min(0).max(100_000_000).nullable().optional(),
  contractStartDate: z.string().optional().or(z.literal("")),
  contractEndDate: z.string().optional().or(z.literal("")),
  targetLaunchDate: z.string().optional().or(z.literal("")),

  mainGoal: z.string().max(2000).optional().or(z.literal("")),
  mainProblem: z.string().max(2000).optional().or(z.literal("")),
  targetAudience: z.string().max(2000).optional().or(z.literal("")),
  mainOffer: z.string().max(2000).optional().or(z.literal("")),

  projectManagerId: z.string().optional().or(z.literal("")),
  /** Seat -> user id. Only the seats this service needs are honoured. */
  specialistOwners: z.record(z.string(), z.string()).optional(),
  notes: z.string().max(4000).optional().or(z.literal("")),
});

// --- Governance --------------------------------------------------------------

export const sopSchema = z.object({
  sopId: z.string().optional().or(z.literal("")),
  reference: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  summary: z.string().max(1000).optional().or(z.literal("")),
  content: z.string().min(1).max(200_000),
  changeNote: z.string().max(1000).optional().or(z.literal("")),
  ownerId: z.string().optional().or(z.literal("")),
});

export const sopActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("review") }),
]);

export const auditSchema = z.object({
  auditId: z.string().optional().or(z.literal("")),
  type: z.nativeEnum(AuditType),
  scope: z.string().min(1).max(1000),
  clientId: z.string().optional().or(z.literal("")),
  auditorId: z.string().optional().or(z.literal("")),
  summary: z.string().max(4000).optional().or(z.literal("")),
  complianceScore: z.number().int().min(0).max(100).nullable().optional(),
  overallResult: z.nativeEnum(ComplianceStatus).nullable().optional(),
});

export const auditFindingSchema = z.object({
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(4000),
  result: z.nativeEnum(ComplianceStatus),
  isCritical: z.boolean().optional(),
  sopId: z.string().optional().or(z.literal("")),
  evidenceUrl: z.string().max(500).optional().or(z.literal("")),
});

export const correctiveActionSchema = z.object({
  actionId: z.string().optional().or(z.literal("")),
  findingId: z.string().optional().or(z.literal("")),
  title: z.string().min(1).max(200),
  risk: z.string().max(2000).optional().or(z.literal("")),
  immediateCorrection: z.string().max(2000).optional().or(z.literal("")),
  rootCause: z.string().max(2000).optional().or(z.literal("")),
  processCorrection: z.string().max(2000).optional().or(z.literal("")),
  status: z.nativeEnum(CorrectiveActionStatus).optional(),
  ownerId: z.string().optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
  evidenceUrl: z.string().max(500).optional().or(z.literal("")),
});

export const correctiveActionVerifySchema = z.object({
  note: z.string().max(2000).optional().or(z.literal("")),
});

export const improvementSchema = z.object({
  improvementId: z.string().optional().or(z.literal("")),
  title: z.string().min(1).max(200),
  problem: z.string().min(1).max(4000),
  source: z.string().max(200).optional().or(z.literal("")),
  proposedSolution: z.string().max(4000).optional().or(z.literal("")),
  benefit: z.string().max(2000).optional().or(z.literal("")),
  effortEstimate: z.string().max(200).optional().or(z.literal("")),
  priority: z.nativeEnum(ImprovementPriority).optional(),
  status: z.nativeEnum(ImprovementStatus).optional(),
  ownerId: z.string().optional().or(z.literal("")),
  result: z.string().max(4000).optional().or(z.literal("")),
});

export const trainingRecordSchema = z.object({
  recordId: z.string().optional().or(z.literal("")),
  userId: z.string().min(1),
  courseName: z.string().min(1).max(200),
  sopReference: z.string().max(40).optional().or(z.literal("")),
  status: z.nativeEnum(TrainingStatus).optional(),
  dueDate: z.string().optional().or(z.literal("")),
  assessmentScore: z.number().int().min(0).max(100).nullable().optional(),
  certificationAwarded: z.nativeEnum(CertificationLevel).nullable().optional(),
  certificationExpiresAt: z.string().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

// --- Renewal, expansion, advocacy and offboarding ---------------------------

const money = z.number().min(0).max(100_000_000).nullable().optional();

export const renewalSchema = z.object({
  stage: z.nativeEnum(RenewalStage),
  renewalDate: z.string().optional().or(z.literal("")),
  contractEndDate: z.string().optional().or(z.literal("")),
  currentPackage: z.string().max(200).optional().or(z.literal("")),
  recommendedPackage: z.string().max(200).optional().or(z.literal("")),
  currentValue: money,
  renewalValue: money,
  meetingAt: z.string().optional().or(z.literal("")),
  decisionDate: z.string().optional().or(z.literal("")),
  clientInterest: z.string().max(2000).optional().or(z.literal("")),
  nextAction: z.string().max(1000).optional().or(z.literal("")),
  outcomeNote: z.string().max(2000).optional().or(z.literal("")),
  ownerId: z.string().optional().or(z.literal("")),
});

export const expansionSchema = z.object({
  expansionId: z.string().optional().or(z.literal("")),
  type: z.nativeEnum(ExpansionType),
  status: z.nativeEnum(ExpansionStatus).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  estimatedValue: money,
  targetDate: z.string().optional().or(z.literal("")),
  outcomeNote: z.string().max(2000).optional().or(z.literal("")),
  ownerId: z.string().optional().or(z.literal("")),
});

export const testimonialSchema = z.object({
  testimonialId: z.string().optional().or(z.literal("")),
  format: z.nativeEnum(TestimonialFormat),
  status: z.nativeEnum(TestimonialStatus).optional(),
  trigger: z.string().max(500).optional().or(z.literal("")),
  content: z.string().max(4000).optional().or(z.literal("")),
  mediaUrl: z.string().max(500).optional().or(z.literal("")),
  publishingChannels: z.string().max(500).optional().or(z.literal("")),
  allowPersonName: z.boolean().optional(),
  allowBusinessName: z.boolean().optional(),
  allowLogo: z.boolean().optional(),
  allowPhoto: z.boolean().optional(),
  allowPerformanceData: z.boolean().optional(),
});

export const referralSchema = z.object({
  referralId: z.string().optional().or(z.literal("")),
  contactName: z.string().min(1).max(160),
  businessName: z.string().max(200).optional().or(z.literal("")),
  email: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(60).optional().or(z.literal("")),
  permissionGranted: z.boolean().optional(),
  status: z.nativeEnum(ReferralStatus).optional(),
  assignedToId: z.string().optional().or(z.literal("")),
  outcome: z.string().max(2000).optional().or(z.literal("")),
  incentiveStatus: z.string().max(200).optional().or(z.literal("")),
});

export const referralConversionSchema = z.object({
  assignedToId: z.string().optional().or(z.literal("")),
});

const offboardingStepKey = z.enum([
  "finalBillingSettledAt",
  "remainingWorkCleared",
  "assetsTransferredAt",
  "dataExportedAt",
  "clientAdminAccessConfirmedAt",
  "agencyAccessRemovedAt",
  "finalReportSentAt",
]);

export const offboardingSchema = z.object({
  status: z.nativeEnum(OffboardingStatus).optional(),
  reason: z.nativeEnum(OffboardingReason).optional(),
  reasonDetail: z.string().max(2000).optional().or(z.literal("")),
  finalServiceDate: z.string().optional().or(z.literal("")),
  supportEndsAt: z.string().optional().or(z.literal("")),
  remainingWork: z.string().max(2000).optional().or(z.literal("")),
  lessonsLearned: z.string().max(4000).optional().or(z.literal("")),
  ownerId: z.string().optional().or(z.literal("")),
  completeSteps: z.array(offboardingStepKey).optional(),
  clearSteps: z.array(offboardingStepKey).optional(),
});

// --- Client reporting and optimization -------------------------------------

export const clientReportSchema = z.object({
  reportId: z.string().optional().or(z.literal("")),
  type: z.nativeEnum(ReportType),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  dueAt: z.string().optional().or(z.literal("")),
  dataSources: z.string().max(2000).optional().or(z.literal("")),
  knownLimitations: z.string().max(2000).optional().or(z.literal("")),
  recommendedActions: z.string().max(4000).optional().or(z.literal("")),
  documentUrl: z.string().max(500).optional().or(z.literal("")),
  dataValidated: z.boolean().optional(),
});

export const reportReviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit") }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("requestChanges"), note: z.string().min(1).max(2000) }),
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("acknowledge") }),
]);

export const optimizationSchema = z.object({
  optimizationId: z.string().optional().or(z.literal("")),
  platform: z.string().min(1).max(120),
  observedProblem: z.string().min(1).max(2000),
  proposedChange: z.string().min(1).max(2000),
  evidence: z.string().max(2000).optional().or(z.literal("")),
  hypothesis: z.string().max(2000).optional().or(z.literal("")),
  expectedMetric: z.string().max(200).optional().or(z.literal("")),
  previousSetting: z.string().max(1000).optional().or(z.literal("")),
  newSetting: z.string().max(1000).optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  result: z.string().max(2000).optional().or(z.literal("")),
  decision: z.nativeEnum(OptimizationDecision).optional(),
  ownerId: z.string().optional().or(z.literal("")),
});

export const recoveryPlanSchema = z.object({
  planId: z.string().optional().or(z.literal("")),
  trigger: z.string().min(1).max(1000),
  objective: z.string().min(1).max(1000),
  actions: z.string().min(1).max(4000),
  status: z.nativeEnum(RecoveryPlanStatus).optional(),
  ownerId: z.string().optional().or(z.literal("")),
  reviewDate: z.string().optional().or(z.literal("")),
  outcome: z.string().max(2000).optional().or(z.literal("")),
});

// --- Quality assurance -----------------------------------------------------

export const defectSchema = z.object({
  title: z.string().min(2).max(160),
  severity: z.nativeEnum(DefectSeverity),
  description: z.string().min(2).max(4000),
  deliverable: z.string().max(160).optional().or(z.literal("")),
  stepsToReproduce: z.string().max(4000).optional().or(z.literal("")),
  expectedResult: z.string().max(2000).optional().or(z.literal("")),
  actualResult: z.string().max(2000).optional().or(z.literal("")),
  evidenceUrl: z.string().max(500).optional().or(z.literal("")),
  assignedToId: z.string().optional().or(z.literal("")),
  projectId: z.string().optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
});

export const defectUpdateSchema = z.object({
  status: z.nativeEnum(DefectStatus).optional(),
  severity: z.nativeEnum(DefectSeverity).optional(),
  assignedToId: z.string().optional().or(z.literal("")),
  correctionNotes: z.string().max(2000).optional().or(z.literal("")),
  retestResult: z.string().max(2000).optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
});

/**
 * Closing a defect is separate from updating one, so the self-verification
 * rule cannot be bypassed by a plain status change.
 */
export const defectClosureSchema = z.object({
  resolution: z.enum([DefectStatus.CLOSED, DefectStatus.PASSED, DefectStatus.WONT_FIX]),
  retestResult: z.string().max(2000).optional().or(z.literal("")),
  overrideReason: z.string().max(1000).optional().or(z.literal("")),
});

export const qaPlanSchema = z.object({
  name: z.string().min(2).max(120),
  deliverable: z.string().min(2).max(160),
  projectId: z.string().optional().or(z.literal("")),
});

export const qaTestSchema = z.object({
  objective: z.string().min(2).max(300),
  steps: z.string().min(2).max(2000),
  expectedResult: z.string().min(2).max(2000),
});

export const qaTestResultSchema = z
  .object({
    status: z.nativeEnum(QaTestStatus),
    actualResult: z.string().max(2000).optional().or(z.literal("")),
    evidenceUrl: z.string().max(500).optional().or(z.literal("")),
  })
  .refine(
    (value) => value.status !== QaTestStatus.FAILED || Boolean(value.actualResult?.trim()),
    { message: "A failed test needs the actual result recorded.", path: ["actualResult"] },
  );

// --- Launches --------------------------------------------------------------

export const launchSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.nativeEnum(LaunchType).optional(),
  scheduledFor: z.string().optional().or(z.literal("")),
  clientTimezone: z.string().max(60).optional().or(z.literal("")),
  ownerId: z.string().optional().or(z.literal("")),
  projectId: z.string().optional().or(z.literal("")),
});

export const launchUpdateSchema = z
  .object({
    ownerId: z.string().optional().or(z.literal("")),
    scheduledFor: z.string().optional().or(z.literal("")),
    rollbackPlan: z.string().max(2000).optional().or(z.literal("")),
    backupVerified: z.boolean().optional(),
    isFrozen: z.boolean().optional(),
    freezeReason: z.string().max(500).optional().or(z.literal("")),
    status: z.nativeEnum(LaunchStatus).optional(),
  })
  .refine((value) => !value.isFrozen || Boolean(value.freezeReason?.trim()), {
    message: "Freezing a launch needs a reason.",
    path: ["freezeReason"],
  });

export const checklistItemSchema = z.object({
  status: z.nativeEnum(ChecklistItemStatus),
});

export const monitoringCheckSchema = z
  .object({
    result: z.nativeEnum(MonitoringResult),
    observations: z.string().max(2000).optional().or(z.literal("")),
  })
  .refine(
    (value) => value.result === MonitoringResult.PENDING || Boolean(value.observations?.trim()),
    { message: "Record what you actually observed.", path: ["observations"] },
  );

// --- Platform access -------------------------------------------------------

/**
 * The access tracker deliberately has no password, secret, or token field.
 * Free-text fields are additionally screened by lib/security/credential-guard.
 */
export const accessRecordSchema = z.object({
  platform: z.nativeEnum(AccessPlatform),
  platformLabel: z.string().max(120).optional().or(z.literal("")),
  accountName: z.string().max(120).optional().or(z.literal("")),
  status: z.nativeEnum(AccessStatus),
  method: z.nativeEnum(AccessMethod).optional().nullable(),
  permissionLevel: z.string().max(120).optional().or(z.literal("")),
  isCritical: z.boolean().default(false),
  twoFactorEnabled: z.boolean().optional().nullable(),
  credentialLocation: z.string().max(200).optional().or(z.literal("")),
  missingPermissions: z.string().max(500).optional().or(z.literal("")),
  assignedToId: z.string().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export const accessRecordUpdateSchema = accessRecordSchema.partial();

// --- Delivery projects -----------------------------------------------------

export const projectSchema = z.object({
  name: z.string().min(2).max(120),
  serviceType: z.nativeEnum(ServiceType).optional().nullable(),
  projectManagerId: z.string().optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
  targetLaunchDate: z.string().optional().or(z.literal("")),
  budgetedHours: z.coerce.number().int().min(0).max(10_000).optional().nullable(),
});

export const projectUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  riskLevel: z.nativeEnum(RiskLevel).optional(),
  projectManagerId: z.string().optional().or(z.literal("")),
  targetLaunchDate: z.string().optional().or(z.literal("")),
  clientDependency: z.string().max(500).optional().or(z.literal("")),
});

export const milestoneSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional().or(z.literal("")),
  dueDate: z.string().optional().or(z.literal("")),
});

export const milestoneCompletionSchema = z.object({
  completed: z.boolean(),
});

// --- Invoicing and payments ------------------------------------------------

export const invoiceSchema = z.object({
  amountDue: z.coerce.number().min(0).max(10_000_000),
  currency: z.string().length(3).optional().or(z.literal("")),
  issuedAt: z.string().optional().or(z.literal("")),
  dueAt: z.string().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export const paymentSchema = z
  .object({
    amount: z.coerce.number().gt(0).max(10_000_000),
    method: z.nativeEnum(PaymentMethod),
    status: z.nativeEnum(PaymentStatus),
    reference: z.string().max(120).optional().or(z.literal("")),
    failureReason: z.string().max(500).optional().or(z.literal("")),
    receivedAt: z.string().optional().or(z.literal("")),
  })
  .refine(
    (value) => value.status !== PaymentStatus.FAILED || Boolean(value.failureReason?.trim()),
    {
      message: "A failed payment needs a reason so it can be chased.",
      path: ["failureReason"],
    },
  );

// --- Leads and sales -------------------------------------------------------

const optionalText = (max: number) => z.string().max(max).optional().or(z.literal(""));

export const leadFormSchema = z.object({
  contactName: z.string().min(2).max(80),
  businessName: z.string().min(2).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: optionalText(40),
  source: z.nativeEnum(LeadSource),
  serviceInterest: z.nativeEnum(ServiceType).optional().nullable(),
  budgetAmount: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  timeline: optionalText(120),
  isDecisionMaker: z.boolean().optional().nullable(),
  mainProblem: optionalText(2000),
  goal: optionalText(2000),
  assignedToId: z.string().optional().or(z.literal("")),
  stageId: z.string().optional().or(z.literal("")),
  nextFollowUpAt: z.string().optional().or(z.literal("")),
  notes: optionalText(3000),
});

export const leadUpdateSchema = leadFormSchema.partial().extend({
  status: z.nativeEnum(LeadStatus).optional(),
  proposalValue: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  proposalSentAt: z.string().optional().or(z.literal("")),
  decisionDate: z.string().optional().or(z.literal("")),
  objection: optionalText(1000),
  lostReason: optionalText(1000),
});

export const leadCallLogSchema = z.object({
  outcome: z.nativeEnum(CallOutcome),
  notes: optionalText(2000),
  durationMinutes: z.coerce.number().int().min(0).max(600).optional().nullable(),
  occurredAt: z.string().optional().or(z.literal("")),
  nextFollowUpAt: z.string().optional().or(z.literal("")),
});

export const leadConversionSchema = z.object({
  serviceType: z.nativeEnum(ServiceType),
  assignedUserId: z.string().optional().or(z.literal("")),
  monthlyValue: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  notes: optionalText(3000),
});

export const employeeTaskEodEntrySchema = z.object({
  entryDate: z.string().min(1),
  summary: z.string().min(2).max(4000),
  blockers: z.string().max(2000).optional().or(z.literal("")),
  nextSteps: z.string().max(2000).optional().or(z.literal("")),
});
