-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('NOT_SENT', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingCadence" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'FAILED', 'REFUNDED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'BANK_TRANSFER', 'DIRECT_DEBIT', 'PAYPAL', 'CHEQUE', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "RenewalStage" AS ENUM ('NOT_STARTED', 'REVIEW_SCHEDULED', 'PROPOSAL_PREPARED', 'PROPOSAL_SENT', 'NEGOTIATING', 'RENEWED', 'DOWNGRADED', 'DECLINED', 'CHURNED');

-- CreateEnum
CREATE TYPE "ExpansionType" AS ENUM ('UPSELL', 'CROSS_SELL', 'ADDITIONAL_SERVICE', 'INCREASED_SCOPE', 'REFERRAL_DRIVEN');

-- CreateEnum
CREATE TYPE "ExpansionStatus" AS ENUM ('IDENTIFIED', 'DISCUSSED', 'PROPOSED', 'WON', 'LOST', 'DEFERRED');

-- CreateEnum
CREATE TYPE "SopStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'ACTIVE', 'SUPERSEDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('ROUTINE', 'SPOT', 'INCIDENT', 'CLIENT', 'DEPARTMENT', 'PLATFORM', 'ANNUAL_GOVERNANCE');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT', 'NOT_APPLICABLE', 'CRITICAL_FAILURE');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CorrectiveActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_VERIFICATION', 'VERIFIED', 'CLOSED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ImprovementStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'IMPLEMENTED', 'REJECTED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ImprovementPriority" AS ENUM ('PRIORITY_ONE', 'PRIORITY_TWO', 'PRIORITY_THREE', 'PRIORITY_FOUR');

-- CreateEnum
CREATE TYPE "LaunchType" AS ENUM ('SOFT_LAUNCH', 'FULL_LAUNCH', 'PHASED_LAUNCH', 'INTERNAL_LAUNCH');

-- CreateEnum
CREATE TYPE "LaunchStatus" AS ENUM ('PLANNED', 'READY', 'IN_PROGRESS', 'MONITORING', 'COMPLETE', 'ROLLED_BACK', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "LaunchChecklistCategory" AS ENUM ('APPROVAL', 'BACKUP', 'DOMAIN', 'WEBSITE', 'FORMS', 'CALENDARS', 'PIPELINES', 'WORKFLOWS', 'EMAIL', 'SMS', 'INTEGRATIONS', 'TRACKING', 'PAYMENT', 'ADS', 'END_TO_END_TEST', 'CLIENT_NOTIFICATION');

-- CreateEnum
CREATE TYPE "ChecklistItemStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'FAILED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "MonitoringWindow" AS ENUM ('FIRST_TWO_HOURS', 'FIRST_24_HOURS', 'FIRST_72_HOURS', 'FIRST_7_DAYS');

-- CreateEnum
CREATE TYPE "MonitoringResult" AS ENUM ('PENDING', 'HEALTHY', 'DEGRADED', 'FAILED');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'MITIGATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('WEBSITE_OUTAGE', 'LEAD_CAPTURE_FAILURE', 'PAYMENT_FAILURE', 'WORKFLOW_FAILURE', 'INTEGRATION_FAILURE', 'CAMPAIGN_OVERSPEND', 'DATA_ISSUE', 'SECURITY_CONCERN', 'INCORRECT_BULK_COMMUNICATION', 'COMPLIANCE_CONCERN', 'OTHER');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'WELCOME_SENT', 'FORM_SENT', 'AWAITING_CLIENT', 'KICKOFF_SCHEDULED', 'KICKOFF_COMPLETE', 'COLLECTING_ACCESS', 'COMPLETE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AccessPlatform" AS ENUM ('GOHIGHLEVEL', 'WEBSITE_ADMIN', 'HOSTING', 'DOMAIN_REGISTRAR', 'DNS', 'META_BUSINESS', 'GOOGLE_ADS', 'GOOGLE_ANALYTICS', 'GOOGLE_TAG_MANAGER', 'GOOGLE_SEARCH_CONSOLE', 'GOOGLE_BUSINESS_PROFILE', 'EMAIL_PLATFORM', 'CALENDAR', 'STRIPE', 'ZAPIER', 'MAKE', 'N8N', 'FILE_STORAGE', 'PROJECT_MANAGEMENT', 'COMMUNICATION', 'PASSWORD_MANAGER', 'SOCIAL_INSTAGRAM', 'SOCIAL_FACEBOOK', 'SOCIAL_LINKEDIN', 'SOCIAL_TIKTOK', 'SOCIAL_YOUTUBE', 'OTHER');

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'PENDING_CLIENT', 'GRANTED', 'TESTED', 'INSUFFICIENT_PERMISSIONS', 'FAILED', 'REVOKED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "AccessMethod" AS ENUM ('DELEGATED_ACCESS', 'USER_INVITE', 'SHARED_VIA_PASSWORD_MANAGER', 'AGENCY_OWNED', 'CLIENT_MANAGED', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('LOGO', 'BRAND_GUIDELINES', 'IMAGERY', 'VIDEO', 'COPY', 'TESTIMONIAL', 'PRODUCT_INFORMATION', 'PRICING', 'LEGAL', 'PRIOR_CAMPAIGN', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'APPROVED', 'REJECTED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'NEEDS_REVISION', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QaPlanStatus" AS ENUM ('DRAFT', 'READY', 'IN_PROGRESS', 'PASSED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "QaTestStatus" AS ENUM ('NOT_RUN', 'PASSED', 'FAILED', 'BLOCKED', 'SKIPPED', 'RETEST_REQUIRED');

-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'READY_FOR_RETEST', 'REOPENED', 'PASSED', 'CLOSED', 'BLOCKED', 'WONT_FIX');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PREPARING', 'SENT', 'AWAITING_FEEDBACK', 'FEEDBACK_RECEIVED', 'REVISIONS_IN_PROGRESS', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('DEFECT', 'FACTUAL_CORRECTION', 'INCLUDED_REVISION', 'PREFERENCE', 'ENHANCEMENT', 'SCOPE_CHANGE', 'QUESTION', 'REJECTED');

-- CreateEnum
CREATE TYPE "RevisionStatus" AS ENUM ('LOGGED', 'APPROVED_FOR_WORK', 'IN_PROGRESS', 'READY_FOR_QA', 'COMPLETE', 'DECLINED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('STRATEGY_BRIEF', 'DELIVERABLE', 'LAUNCH', 'SCOPE_CHANGE', 'FINAL_SIGN_OFF');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('WEEKLY_UPDATE', 'MONTHLY_REPORT', 'QUARTERLY_BUSINESS_REVIEW', 'LAUNCH_REPORT', 'FINAL_REPORT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SENT', 'ACKNOWLEDGED', 'LATE');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('LOGGED', 'INVESTIGATING', 'ACTION_AGREED', 'RESOLVED', 'ESCALATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "RecoveryPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'MONITORING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OptimizationDecision" AS ENUM ('PENDING', 'KEEP', 'ADJUST', 'REVERSE', 'CONTINUE_TESTING', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "TestimonialStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'APPROVED', 'PUBLISHED', 'DECLINED');

-- CreateEnum
CREATE TYPE "TestimonialFormat" AS ENUM ('WRITTEN', 'VIDEO', 'CASE_STUDY', 'REVIEW_PLATFORM');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('RECEIVED', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST', 'DECLINED');

-- CreateEnum
CREATE TYPE "TrainingSessionType" AS ENUM ('PLATFORM_WALKTHROUGH', 'CRM_TRAINING', 'REPORTING_TRAINING', 'HANDOVER', 'REFRESHER');

-- CreateEnum
CREATE TYPE "OffboardingStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'AWAITING_CLIENT', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OffboardingReason" AS ENUM ('CONTRACT_ENDED', 'CLIENT_CANCELLED', 'AGENCY_CANCELLED', 'PROJECT_COMPLETE', 'BUDGET', 'PERFORMANCE', 'RELATIONSHIP', 'BUSINESS_CLOSED', 'OTHER');

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "agreementStatus" "AgreementStatus" NOT NULL DEFAULT 'NOT_SENT',
    "signedAt" TIMESTAMP(3),
    "contractValue" DECIMAL(12,2),
    "depositAmount" DECIMAL(12,2),
    "recurringFee" DECIMAL(12,2),
    "billingCadence" "BillingCadence" NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "cancellationNoticeDays" INTEGER,
    "cancellationRequestedAt" TIMESTAMP(3),
    "finalInvoiceIssuedAt" TIMESTAMP(3),
    "documentUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contractId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "amountDue" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CARD',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "failureReason" TEXT,
    "receivedAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Renewal" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "contractId" TEXT,
    "stage" "RenewalStage" NOT NULL DEFAULT 'NOT_STARTED',
    "contractEndDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "currentPackage" TEXT,
    "recommendedPackage" TEXT,
    "currentValue" DECIMAL(12,2),
    "renewalValue" DECIMAL(12,2),
    "meetingAt" TIMESTAMP(3),
    "proposalSentAt" TIMESTAMP(3),
    "decisionDate" TIMESTAMP(3),
    "outcomeNote" TEXT,
    "clientInterest" TEXT,
    "nextAction" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Renewal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpansionOpportunity" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "ExpansionType" NOT NULL,
    "status" "ExpansionStatus" NOT NULL DEFAULT 'IDENTIFIED',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "estimatedValue" DECIMAL(12,2),
    "ownerId" TEXT,
    "targetDate" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "outcomeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpansionOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sop" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "SopStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" TEXT NOT NULL DEFAULT '1.0',
    "ownerId" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SopVersion" (
    "id" TEXT NOT NULL,
    "sopId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "changeNote" TEXT,
    "authorId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SopVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "type" "AuditType" NOT NULL,
    "status" "AuditStatus" NOT NULL DEFAULT 'PLANNED',
    "auditorId" TEXT,
    "clientId" TEXT,
    "department" "Department",
    "scope" TEXT NOT NULL,
    "conductedAt" TIMESTAMP(3),
    "complianceScore" INTEGER,
    "overallResult" "ComplianceStatus",
    "summary" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "sopId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "result" "ComplianceStatus" NOT NULL DEFAULT 'NON_COMPLIANT',
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "evidenceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectiveAction" (
    "id" TEXT NOT NULL,
    "findingId" TEXT,
    "incidentId" TEXT,
    "title" TEXT NOT NULL,
    "risk" TEXT,
    "immediateCorrection" TEXT,
    "rootCause" TEXT,
    "processCorrection" TEXT,
    "status" "CorrectiveActionStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "evidenceUrl" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImprovementRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "source" TEXT,
    "proposedSolution" TEXT,
    "benefit" TEXT,
    "riskReduction" TEXT,
    "effortEstimate" TEXT,
    "priority" "ImprovementPriority" NOT NULL DEFAULT 'PRIORITY_THREE',
    "status" "ImprovementStatus" NOT NULL DEFAULT 'PROPOSED',
    "ownerId" TEXT,
    "raisedById" TEXT,
    "result" TEXT,
    "implementedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImprovementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Launch" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "type" "LaunchType" NOT NULL DEFAULT 'FULL_LAUNCH',
    "status" "LaunchStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledFor" TIMESTAMP(3),
    "launchWindow" TEXT,
    "clientTimezone" TEXT,
    "ownerId" TEXT,
    "backupVerifiedAt" TIMESTAMP(3),
    "rollbackPlan" TEXT,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "freezeReason" TEXT,
    "systemsActivated" TEXT,
    "campaignsActivated" TEXT,
    "completedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Launch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchChecklistItem" (
    "id" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "category" "LaunchChecklistCategory" NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ChecklistItemStatus" NOT NULL DEFAULT 'PENDING',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "evidenceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaunchChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringCheck" (
    "id" TEXT NOT NULL,
    "launchId" TEXT NOT NULL,
    "window" "MonitoringWindow" NOT NULL,
    "result" "MonitoringResult" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "checkedById" TEXT,
    "observations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "launchId" TEXT,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "IncidentCategory" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "affectedSystem" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessImpact" TEXT,
    "ownerId" TEXT,
    "immediateAction" TEXT,
    "rootCause" TEXT,
    "correction" TEXT,
    "rollbackPerformed" BOOLEAN NOT NULL DEFAULT false,
    "verification" TEXT,
    "clientCommunication" TEXT,
    "preventiveAction" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingRecord" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "welcomeEmailSentAt" TIMESTAMP(3),
    "formSentAt" TIMESTAMP(3),
    "formSubmittedAt" TIMESTAMP(3),
    "missingInformation" TEXT,
    "kickoffScheduledAt" TIMESTAMP(3),
    "kickoffCompletedAt" TIMESTAMP(3),
    "communicationPreference" TEXT,
    "targetLaunchDate" TIMESTAMP(3),
    "blocker" TEXT,
    "completedAt" TIMESTAMP(3),
    "ownerId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRecord" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "AccessPlatform" NOT NULL,
    "platformLabel" TEXT,
    "accountName" TEXT,
    "status" "AccessStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "method" "AccessMethod",
    "permissionLevel" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMP(3),
    "grantedAt" TIMESTAMP(3),
    "testedAt" TIMESTAMP(3),
    "missingPermissions" TEXT,
    "twoFactorEnabled" BOOLEAN,
    "credentialLocation" TEXT,
    "assignedToId" TEXT,
    "removedAt" TIMESTAMP(3),
    "removalConfirmedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRecord" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'REQUESTED',
    "fileUrl" TEXT,
    "version" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyBrief" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "BriefStatus" NOT NULL DEFAULT 'DRAFT',
    "primaryGoal" TEXT,
    "successMetrics" TEXT,
    "targetAudience" TEXT,
    "mainOffer" TEXT,
    "serviceArea" TEXT,
    "callToAction" TEXT,
    "customerJourney" TEXT,
    "funnelStrategy" TEXT,
    "crmStrategy" TEXT,
    "advertisingStrategy" TEXT,
    "trackingStrategy" TEXT,
    "contentStrategy" TEXT,
    "technicalArchitecture" TEXT,
    "risks" TEXT,
    "dependencies" TEXT,
    "clientResponsibilities" TEXT,
    "agencyResponsibilities" TEXT,
    "timelineSummary" TEXT,
    "authorId" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaPlan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "deliverable" TEXT NOT NULL,
    "status" "QaPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaTest" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "objective" TEXT NOT NULL,
    "steps" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "actualResult" TEXT,
    "status" "QaTestStatus" NOT NULL DEFAULT 'NOT_RUN',
    "testerId" TEXT,
    "evidenceUrl" TEXT,
    "executedAt" TIMESTAMP(3),
    "retestRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Defect" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "planId" TEXT,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "deliverable" TEXT,
    "severity" "DefectSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "DefectStatus" NOT NULL DEFAULT 'NEW',
    "description" TEXT NOT NULL,
    "stepsToReproduce" TEXT,
    "expectedResult" TEXT,
    "actualResult" TEXT,
    "evidenceUrl" TEXT,
    "raisedById" TEXT,
    "assignedToId" TEXT,
    "verifiedById" TEXT,
    "dueDate" TIMESTAMP(3),
    "correctionNotes" TEXT,
    "retestResult" TEXT,
    "closedAt" TIMESTAMP(3),
    "closureOverrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Defect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewCycle" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PREPARING',
    "reviewLink" TEXT,
    "walkthroughLink" TEXT,
    "sentAt" TIMESTAMP(3),
    "feedbackDeadline" TIMESTAMP(3),
    "feedbackReceivedAt" TIMESTAMP(3),
    "approverContactId" TEXT,
    "ownerId" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionItem" (
    "id" TEXT NOT NULL,
    "reviewCycleId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientComment" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL DEFAULT 'INCLUDED_REVISION',
    "approvedAction" TEXT,
    "status" "RevisionStatus" NOT NULL DEFAULT 'LOGGED',
    "assignedToId" TEXT,
    "dueDate" TIMESTAMP(3),
    "completionEvidence" TEXT,
    "qaVerified" BOOLEAN NOT NULL DEFAULT false,
    "clientAccepted" BOOLEAN NOT NULL DEFAULT false,
    "additionalCost" DECIMAL(12,2),
    "timelineImpactDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevisionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" "ApprovalType" NOT NULL,
    "subject" TEXT NOT NULL,
    "approverContactId" TEXT,
    "approvedByName" TEXT,
    "evidenceUrl" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientHealthAssessment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "HealthStatus" NOT NULL,
    "healthScore" INTEGER,
    "satisfactionScore" INTEGER,
    "communicationStatus" TEXT,
    "paymentStatus" TEXT,
    "performanceStatus" TEXT,
    "clientParticipation" TEXT,
    "openComplaints" INTEGER NOT NULL DEFAULT 0,
    "cancellationThreat" BOOLEAN NOT NULL DEFAULT false,
    "renewalProbability" INTEGER,
    "summary" TEXT,
    "assessedById" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientHealthAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "serviceArea" TEXT,
    "businessImpact" TEXT,
    "evidenceUrl" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'LOGGED',
    "rootCause" TEXT,
    "resolutionPlan" TEXT,
    "clientCommunication" TEXT,
    "ownerId" TEXT,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followUpAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "finalOutcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryPlan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "RecoveryPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "trigger" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "actions" TEXT NOT NULL,
    "ownerId" TEXT,
    "startDate" TIMESTAMP(3),
    "reviewDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientReport" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dataSources" TEXT,
    "dataValidatedAt" TIMESTAMP(3),
    "knownLimitations" TEXT,
    "recommendedActions" TEXT,
    "documentUrl" TEXT,
    "preparedById" TEXT,
    "reviewedById" TEXT,
    "sentAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "clientAcknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Optimization" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "observedProblem" TEXT NOT NULL,
    "evidence" TEXT,
    "hypothesis" TEXT,
    "proposedChange" TEXT NOT NULL,
    "expectedMetric" TEXT,
    "previousSetting" TEXT,
    "newSetting" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "result" TEXT,
    "decision" "OptimizationDecision" NOT NULL DEFAULT 'PENDING',
    "ownerId" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Optimization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "TestimonialStatus" NOT NULL DEFAULT 'REQUESTED',
    "format" "TestimonialFormat" NOT NULL DEFAULT 'WRITTEN',
    "trigger" TEXT,
    "requestedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "content" TEXT,
    "mediaUrl" TEXT,
    "allowBusinessName" BOOLEAN NOT NULL DEFAULT false,
    "allowPersonName" BOOLEAN NOT NULL DEFAULT false,
    "allowLogo" BOOLEAN NOT NULL DEFAULT false,
    "allowPhoto" BOOLEAN NOT NULL DEFAULT false,
    "allowPerformanceData" BOOLEAN NOT NULL DEFAULT false,
    "publishingChannels" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referringClientId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "businessName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "permissionGranted" BOOLEAN NOT NULL DEFAULT false,
    "status" "ReferralStatus" NOT NULL DEFAULT 'RECEIVED',
    "assignedToId" TEXT,
    "leadId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT,
    "thankYouSentAt" TIMESTAMP(3),
    "incentiveStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "TrainingSessionType" NOT NULL DEFAULT 'PLATFORM_WALKTHROUGH',
    "scheduledFor" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "trainerId" TEXT,
    "agenda" TEXT,
    "participants" TEXT,
    "recordingUrl" TEXT,
    "writtenGuideUrl" TEXT,
    "questionsRaised" TEXT,
    "followUpRequired" BOOLEAN NOT NULL DEFAULT false,
    "competencyConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffboardingRecord" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "OffboardingStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" "OffboardingReason" NOT NULL DEFAULT 'OTHER',
    "reasonDetail" TEXT,
    "cancellationRequestedAt" TIMESTAMP(3),
    "finalServiceDate" TIMESTAMP(3),
    "finalBillingSettledAt" TIMESTAMP(3),
    "remainingWork" TEXT,
    "finalReportSentAt" TIMESTAMP(3),
    "assetsTransferredAt" TIMESTAMP(3),
    "dataExportedAt" TIMESTAMP(3),
    "clientAdminAccessConfirmedAt" TIMESTAMP(3),
    "agencyAccessRemovedAt" TIMESTAMP(3),
    "subscriptionsCancelledAt" TIMESTAMP(3),
    "finalTrainingAt" TIMESTAMP(3),
    "supportEndsAt" TIMESTAMP(3),
    "clientConfirmedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "lessonsLearned" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OffboardingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_clientId_idx" ON "Contract"("clientId");

-- CreateIndex
CREATE INDEX "Contract_agreementStatus_idx" ON "Contract"("agreementStatus");

-- CreateIndex
CREATE INDEX "Contract_renewalDate_idx" ON "Contract"("renewalDate");

-- CreateIndex
CREATE INDEX "Contract_endDate_idx" ON "Contract"("endDate");

-- CreateIndex
CREATE INDEX "Contract_deletedAt_idx" ON "Contract"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");

-- CreateIndex
CREATE INDEX "Invoice_contractId_idx" ON "Invoice"("contractId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_dueAt_idx" ON "Invoice"("dueAt");

-- CreateIndex
CREATE INDEX "Invoice_deletedAt_idx" ON "Invoice"("deletedAt");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_receivedAt_idx" ON "Payment"("receivedAt");

-- CreateIndex
CREATE INDEX "Renewal_clientId_idx" ON "Renewal"("clientId");

-- CreateIndex
CREATE INDEX "Renewal_stage_idx" ON "Renewal"("stage");

-- CreateIndex
CREATE INDEX "Renewal_renewalDate_idx" ON "Renewal"("renewalDate");

-- CreateIndex
CREATE INDEX "Renewal_ownerId_idx" ON "Renewal"("ownerId");

-- CreateIndex
CREATE INDEX "ExpansionOpportunity_clientId_idx" ON "ExpansionOpportunity"("clientId");

-- CreateIndex
CREATE INDEX "ExpansionOpportunity_status_idx" ON "ExpansionOpportunity"("status");

-- CreateIndex
CREATE INDEX "ExpansionOpportunity_ownerId_idx" ON "ExpansionOpportunity"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Sop_reference_key" ON "Sop"("reference");

-- CreateIndex
CREATE INDEX "Sop_status_idx" ON "Sop"("status");

-- CreateIndex
CREATE INDEX "Sop_nextReviewAt_idx" ON "Sop"("nextReviewAt");

-- CreateIndex
CREATE INDEX "Sop_ownerId_idx" ON "Sop"("ownerId");

-- CreateIndex
CREATE INDEX "SopVersion_sopId_idx" ON "SopVersion"("sopId");

-- CreateIndex
CREATE UNIQUE INDEX "SopVersion_sopId_version_key" ON "SopVersion"("sopId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Audit_reference_key" ON "Audit"("reference");

-- CreateIndex
CREATE INDEX "Audit_type_idx" ON "Audit"("type");

-- CreateIndex
CREATE INDEX "Audit_status_idx" ON "Audit"("status");

-- CreateIndex
CREATE INDEX "Audit_clientId_idx" ON "Audit"("clientId");

-- CreateIndex
CREATE INDEX "Audit_conductedAt_idx" ON "Audit"("conductedAt");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_idx" ON "AuditFinding"("auditId");

-- CreateIndex
CREATE INDEX "AuditFinding_result_idx" ON "AuditFinding"("result");

-- CreateIndex
CREATE INDEX "AuditFinding_isCritical_idx" ON "AuditFinding"("isCritical");

-- CreateIndex
CREATE INDEX "CorrectiveAction_findingId_idx" ON "CorrectiveAction"("findingId");

-- CreateIndex
CREATE INDEX "CorrectiveAction_status_idx" ON "CorrectiveAction"("status");

-- CreateIndex
CREATE INDEX "CorrectiveAction_ownerId_idx" ON "CorrectiveAction"("ownerId");

-- CreateIndex
CREATE INDEX "CorrectiveAction_dueDate_idx" ON "CorrectiveAction"("dueDate");

-- CreateIndex
CREATE INDEX "ImprovementRequest_status_idx" ON "ImprovementRequest"("status");

-- CreateIndex
CREATE INDEX "ImprovementRequest_priority_idx" ON "ImprovementRequest"("priority");

-- CreateIndex
CREATE INDEX "ImprovementRequest_ownerId_idx" ON "ImprovementRequest"("ownerId");

-- CreateIndex
CREATE INDEX "Launch_clientId_idx" ON "Launch"("clientId");

-- CreateIndex
CREATE INDEX "Launch_projectId_idx" ON "Launch"("projectId");

-- CreateIndex
CREATE INDEX "Launch_status_idx" ON "Launch"("status");

-- CreateIndex
CREATE INDEX "Launch_scheduledFor_idx" ON "Launch"("scheduledFor");

-- CreateIndex
CREATE INDEX "Launch_ownerId_idx" ON "Launch"("ownerId");

-- CreateIndex
CREATE INDEX "LaunchChecklistItem_launchId_idx" ON "LaunchChecklistItem"("launchId");

-- CreateIndex
CREATE INDEX "LaunchChecklistItem_status_idx" ON "LaunchChecklistItem"("status");

-- CreateIndex
CREATE INDEX "MonitoringCheck_launchId_idx" ON "MonitoringCheck"("launchId");

-- CreateIndex
CREATE INDEX "MonitoringCheck_result_idx" ON "MonitoringCheck"("result");

-- CreateIndex
CREATE INDEX "MonitoringCheck_dueAt_idx" ON "MonitoringCheck"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringCheck_launchId_window_key" ON "MonitoringCheck"("launchId", "window");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_reference_key" ON "Incident"("reference");

-- CreateIndex
CREATE INDEX "Incident_clientId_idx" ON "Incident"("clientId");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Incident_severity_idx" ON "Incident"("severity");

-- CreateIndex
CREATE INDEX "Incident_detectedAt_idx" ON "Incident"("detectedAt");

-- CreateIndex
CREATE INDEX "Incident_ownerId_idx" ON "Incident"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingRecord_clientId_key" ON "OnboardingRecord"("clientId");

-- CreateIndex
CREATE INDEX "OnboardingRecord_status_idx" ON "OnboardingRecord"("status");

-- CreateIndex
CREATE INDEX "OnboardingRecord_ownerId_idx" ON "OnboardingRecord"("ownerId");

-- CreateIndex
CREATE INDEX "AccessRecord_clientId_idx" ON "AccessRecord"("clientId");

-- CreateIndex
CREATE INDEX "AccessRecord_status_idx" ON "AccessRecord"("status");

-- CreateIndex
CREATE INDEX "AccessRecord_isCritical_idx" ON "AccessRecord"("isCritical");

-- CreateIndex
CREATE INDEX "AccessRecord_assignedToId_idx" ON "AccessRecord"("assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRecord_clientId_platform_platformLabel_key" ON "AccessRecord"("clientId", "platform", "platformLabel");

-- CreateIndex
CREATE INDEX "AssetRecord_clientId_idx" ON "AssetRecord"("clientId");

-- CreateIndex
CREATE INDEX "AssetRecord_status_idx" ON "AssetRecord"("status");

-- CreateIndex
CREATE INDEX "AssetRecord_isRequired_idx" ON "AssetRecord"("isRequired");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyBrief_clientId_key" ON "StrategyBrief"("clientId");

-- CreateIndex
CREATE INDEX "StrategyBrief_status_idx" ON "StrategyBrief"("status");

-- CreateIndex
CREATE INDEX "QaPlan_clientId_idx" ON "QaPlan"("clientId");

-- CreateIndex
CREATE INDEX "QaPlan_projectId_idx" ON "QaPlan"("projectId");

-- CreateIndex
CREATE INDEX "QaPlan_status_idx" ON "QaPlan"("status");

-- CreateIndex
CREATE INDEX "QaTest_planId_idx" ON "QaTest"("planId");

-- CreateIndex
CREATE INDEX "QaTest_status_idx" ON "QaTest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Defect_reference_key" ON "Defect"("reference");

-- CreateIndex
CREATE INDEX "Defect_clientId_idx" ON "Defect"("clientId");

-- CreateIndex
CREATE INDEX "Defect_projectId_idx" ON "Defect"("projectId");

-- CreateIndex
CREATE INDEX "Defect_status_idx" ON "Defect"("status");

-- CreateIndex
CREATE INDEX "Defect_severity_idx" ON "Defect"("severity");

-- CreateIndex
CREATE INDEX "Defect_assignedToId_idx" ON "Defect"("assignedToId");

-- CreateIndex
CREATE INDEX "Defect_dueDate_idx" ON "Defect"("dueDate");

-- CreateIndex
CREATE INDEX "ReviewCycle_clientId_idx" ON "ReviewCycle"("clientId");

-- CreateIndex
CREATE INDEX "ReviewCycle_status_idx" ON "ReviewCycle"("status");

-- CreateIndex
CREATE INDEX "ReviewCycle_feedbackDeadline_idx" ON "ReviewCycle"("feedbackDeadline");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewCycle_clientId_projectId_roundNumber_key" ON "ReviewCycle"("clientId", "projectId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RevisionItem_reference_key" ON "RevisionItem"("reference");

-- CreateIndex
CREATE INDEX "RevisionItem_reviewCycleId_idx" ON "RevisionItem"("reviewCycleId");

-- CreateIndex
CREATE INDEX "RevisionItem_status_idx" ON "RevisionItem"("status");

-- CreateIndex
CREATE INDEX "RevisionItem_category_idx" ON "RevisionItem"("category");

-- CreateIndex
CREATE INDEX "RevisionItem_assignedToId_idx" ON "RevisionItem"("assignedToId");

-- CreateIndex
CREATE INDEX "Approval_clientId_type_idx" ON "Approval"("clientId", "type");

-- CreateIndex
CREATE INDEX "Approval_projectId_idx" ON "Approval"("projectId");

-- CreateIndex
CREATE INDEX "Approval_approvedAt_idx" ON "Approval"("approvedAt");

-- CreateIndex
CREATE INDEX "ClientHealthAssessment_clientId_assessedAt_idx" ON "ClientHealthAssessment"("clientId", "assessedAt");

-- CreateIndex
CREATE INDEX "ClientHealthAssessment_status_idx" ON "ClientHealthAssessment"("status");

-- CreateIndex
CREATE INDEX "Complaint_clientId_idx" ON "Complaint"("clientId");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "Complaint_ownerId_idx" ON "Complaint"("ownerId");

-- CreateIndex
CREATE INDEX "Complaint_followUpAt_idx" ON "Complaint"("followUpAt");

-- CreateIndex
CREATE INDEX "RecoveryPlan_clientId_idx" ON "RecoveryPlan"("clientId");

-- CreateIndex
CREATE INDEX "RecoveryPlan_status_idx" ON "RecoveryPlan"("status");

-- CreateIndex
CREATE INDEX "RecoveryPlan_reviewDate_idx" ON "RecoveryPlan"("reviewDate");

-- CreateIndex
CREATE INDEX "ClientReport_clientId_type_idx" ON "ClientReport"("clientId", "type");

-- CreateIndex
CREATE INDEX "ClientReport_status_idx" ON "ClientReport"("status");

-- CreateIndex
CREATE INDEX "ClientReport_dueAt_idx" ON "ClientReport"("dueAt");

-- CreateIndex
CREATE INDEX "Optimization_clientId_platform_idx" ON "Optimization"("clientId", "platform");

-- CreateIndex
CREATE INDEX "Optimization_decision_idx" ON "Optimization"("decision");

-- CreateIndex
CREATE INDEX "Testimonial_clientId_idx" ON "Testimonial"("clientId");

-- CreateIndex
CREATE INDEX "Testimonial_status_idx" ON "Testimonial"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_leadId_key" ON "Referral"("leadId");

-- CreateIndex
CREATE INDEX "Referral_referringClientId_idx" ON "Referral"("referringClientId");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- CreateIndex
CREATE INDEX "TrainingSession_clientId_idx" ON "TrainingSession"("clientId");

-- CreateIndex
CREATE INDEX "TrainingSession_scheduledFor_idx" ON "TrainingSession"("scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "OffboardingRecord_clientId_key" ON "OffboardingRecord"("clientId");

-- CreateIndex
CREATE INDEX "OffboardingRecord_status_idx" ON "OffboardingRecord"("status");

-- CreateIndex
CREATE INDEX "OffboardingRecord_ownerId_idx" ON "OffboardingRecord"("ownerId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpansionOpportunity" ADD CONSTRAINT "ExpansionOpportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpansionOpportunity" ADD CONSTRAINT "ExpansionOpportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sop" ADD CONSTRAINT "Sop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sop" ADD CONSTRAINT "Sop_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopVersion" ADD CONSTRAINT "SopVersion_sopId_fkey" FOREIGN KEY ("sopId") REFERENCES "Sop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SopVersion" ADD CONSTRAINT "SopVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_sopId_fkey" FOREIGN KEY ("sopId") REFERENCES "Sop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AuditFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementRequest" ADD CONSTRAINT "ImprovementRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImprovementRequest" ADD CONSTRAINT "ImprovementRequest_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Launch" ADD CONSTRAINT "Launch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Launch" ADD CONSTRAINT "Launch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Launch" ADD CONSTRAINT "Launch_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchChecklistItem" ADD CONSTRAINT "LaunchChecklistItem_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "Launch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchChecklistItem" ADD CONSTRAINT "LaunchChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringCheck" ADD CONSTRAINT "MonitoringCheck_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "Launch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringCheck" ADD CONSTRAINT "MonitoringCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "Launch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingRecord" ADD CONSTRAINT "OnboardingRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingRecord" ADD CONSTRAINT "OnboardingRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRecord" ADD CONSTRAINT "AccessRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRecord" ADD CONSTRAINT "AccessRecord_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRecord" ADD CONSTRAINT "AccessRecord_removalConfirmedById_fkey" FOREIGN KEY ("removalConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetRecord" ADD CONSTRAINT "AssetRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyBrief" ADD CONSTRAINT "StrategyBrief_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyBrief" ADD CONSTRAINT "StrategyBrief_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyBrief" ADD CONSTRAINT "StrategyBrief_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaPlan" ADD CONSTRAINT "QaPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaPlan" ADD CONSTRAINT "QaPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaPlan" ADD CONSTRAINT "QaPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaTest" ADD CONSTRAINT "QaTest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "QaPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaTest" ADD CONSTRAINT "QaTest_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_planId_fkey" FOREIGN KEY ("planId") REFERENCES "QaPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_approverContactId_fkey" FOREIGN KEY ("approverContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewCycle" ADD CONSTRAINT "ReviewCycle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionItem" ADD CONSTRAINT "RevisionItem_reviewCycleId_fkey" FOREIGN KEY ("reviewCycleId") REFERENCES "ReviewCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionItem" ADD CONSTRAINT "RevisionItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverContactId_fkey" FOREIGN KEY ("approverContactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHealthAssessment" ADD CONSTRAINT "ClientHealthAssessment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHealthAssessment" ADD CONSTRAINT "ClientHealthAssessment_assessedById_fkey" FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlan" ADD CONSTRAINT "RecoveryPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryPlan" ADD CONSTRAINT "RecoveryPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReport" ADD CONSTRAINT "ClientReport_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReport" ADD CONSTRAINT "ClientReport_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientReport" ADD CONSTRAINT "ClientReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Optimization" ADD CONSTRAINT "Optimization_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Optimization" ADD CONSTRAINT "Optimization_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Optimization" ADD CONSTRAINT "Optimization_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referringClientId_fkey" FOREIGN KEY ("referringClientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OffboardingRecord" ADD CONSTRAINT "OffboardingRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OffboardingRecord" ADD CONSTRAINT "OffboardingRecord_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
