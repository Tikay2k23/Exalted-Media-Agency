import {
  AccessMethod,
  AccessPlatform,
  AccessStatus,
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
  TaskPriority,
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
