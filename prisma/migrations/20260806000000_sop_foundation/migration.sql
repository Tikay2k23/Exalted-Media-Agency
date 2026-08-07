-- CreateEnum
CREATE TYPE "PipelineKind" AS ENUM ('SALES', 'FULFILLMENT');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('GREEN', 'YELLOW', 'RED', 'NOT_ASSESSED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ATTEMPTING_CONTACT', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'NURTURE', 'CONVERTED', 'LOST', 'ABANDONED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE_FORM', 'PAID_ADS', 'ORGANIC_SEARCH', 'SOCIAL_MEDIA', 'REFERRAL', 'OUTBOUND', 'PARTNER', 'EVENT', 'REPEAT_CLIENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('CONNECTED', 'NO_ANSWER', 'VOICEMAIL', 'RESCHEDULED', 'NOT_INTERESTED', 'CALL_BOOKED', 'CALL_SHOWED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'IN_PRODUCTION', 'INTERNAL_QA', 'CLIENT_REVIEW', 'REVISIONS', 'READY_FOR_LAUNCH', 'LIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('UNASSIGNED', 'AGENCY_OWNER', 'AGENCY_DIRECTOR', 'OPERATIONS_MANAGER', 'SALES_MANAGER', 'SALES_REPRESENTATIVE', 'CLIENT_SUCCESS_MANAGER', 'ACCOUNT_MANAGER', 'PROJECT_MANAGER', 'GOHIGHLEVEL_SPECIALIST', 'CRM_AUTOMATION_SPECIALIST', 'FUNNEL_WEBSITE_BUILDER', 'META_ADS_SPECIALIST', 'GOOGLE_ADS_SPECIALIST', 'SEO_SPECIALIST', 'COPYWRITER', 'GRAPHIC_DESIGNER', 'VIDEO_EDITOR', 'CONTENT_SPECIALIST', 'SOCIAL_MEDIA_MANAGER', 'TRACKING_ANALYTICS_SPECIALIST', 'INTEGRATION_SPECIALIST', 'QA_REVIEWER', 'CLIENT_TRAINER', 'FINANCE_ADMINISTRATOR', 'SECURITY_ADMINISTRATOR', 'HR_TRAINING_MANAGER');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'AGENCY_PARTNER');

-- CreateEnum
CREATE TYPE "CertificationLevel" AS ENUM ('OBSERVER', 'TRAINEE', 'SUPERVISED_OPERATOR', 'CERTIFIED_OPERATOR', 'SENIOR_REVIEWER', 'PROCESS_OWNER');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'LIMITED', 'FULLY_BOOKED', 'ON_LEAVE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "TrainingStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'EXPIRED', 'WAIVED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'CLIENT_WAITING', 'MISSING_ACCESS', 'MISSING_PAYMENT', 'QA_DEFECT', 'REVISION_REQUEST', 'APPROVAL_RECEIVED', 'LAUNCH_SCHEDULED', 'LAUNCH_INCIDENT', 'REPORT_DUE', 'CLIENT_HEALTH_CHANGE', 'RENEWAL_APPROACHING', 'PAYMENT_FAILED', 'AUDIT_FINDING', 'CORRECTIVE_ACTION_OVERDUE', 'CERTIFICATION_EXPIRING', 'STAGE_OVERRIDE');

-- CreateEnum
CREATE TYPE "NotificationUrgency" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityEntityType" ADD VALUE 'LEAD';
ALTER TYPE "ActivityEntityType" ADD VALUE 'PROJECT';
ALTER TYPE "ActivityEntityType" ADD VALUE 'MILESTONE';
ALTER TYPE "ActivityEntityType" ADD VALUE 'CONTRACT';
ALTER TYPE "ActivityEntityType" ADD VALUE 'PERMISSION';
ALTER TYPE "ActivityEntityType" ADD VALUE 'NOTIFICATION';
ALTER TYPE "ActivityEntityType" ADD VALUE 'TRAINING';
ALTER TYPE "ActivityEntityType" ADD VALUE 'SYSTEM';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Department" ADD VALUE 'SALES';
ALTER TYPE "Department" ADD VALUE 'CLIENT_SUCCESS';
ALTER TYPE "Department" ADD VALUE 'QUALITY_ASSURANCE';
ALTER TYPE "Department" ADD VALUE 'FINANCE';
ALTER TYPE "Department" ADD VALUE 'SECURITY';
ALTER TYPE "Department" ADD VALUE 'HUMAN_RESOURCES';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmployeeTaskStatus" ADD VALUE 'READY';
ALTER TYPE "EmployeeTaskStatus" ADD VALUE 'WAITING_INTERNAL';
ALTER TYPE "EmployeeTaskStatus" ADD VALUE 'WAITING_CLIENT';
ALTER TYPE "EmployeeTaskStatus" ADD VALUE 'CHANGES_REQUIRED';
ALTER TYPE "EmployeeTaskStatus" ADD VALUE 'READY_FOR_QA';
ALTER TYPE "EmployeeTaskStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'OWNER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceType" ADD VALUE 'FUNNEL_BUILD';
ALTER TYPE "ServiceType" ADD VALUE 'CRM_AUTOMATION';
ALTER TYPE "ServiceType" ADD VALUE 'SEO';
ALTER TYPE "ServiceType" ADD VALUE 'EMAIL_MARKETING';
ALTER TYPE "ServiceType" ADD VALUE 'FULL_SERVICE_RETAINER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskCategory" ADD VALUE 'ONBOARDING';
ALTER TYPE "TaskCategory" ADD VALUE 'STRATEGY';
ALTER TYPE "TaskCategory" ADD VALUE 'QUALITY_ASSURANCE';
ALTER TYPE "TaskCategory" ADD VALUE 'REVISION';
ALTER TYPE "TaskCategory" ADD VALUE 'LAUNCH';
ALTER TYPE "TaskCategory" ADD VALUE 'CLIENT_TRAINING';
ALTER TYPE "TaskCategory" ADD VALUE 'RENEWAL';
ALTER TYPE "TaskCategory" ADD VALUE 'OFFBOARDING';
ALTER TYPE "TaskCategory" ADD VALUE 'AUDIT';

-- AlterEnum
ALTER TYPE "TaskPriority" ADD VALUE 'CRITICAL';

-- DropIndex
DROP INDEX "PipelineStage_position_key";

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "fieldName" TEXT,
ADD COLUMN     "newValue" TEXT,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "previousValue" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "contractEndDate" TIMESTAMP(3),
ADD COLUMN     "contractStartDate" TIMESTAMP(3),
ADD COLUMN     "currentBlocker" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "healthStatus" "HealthStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "lastClientUpdateAt" TIMESTAMP(3),
ADD COLUMN     "monthlyValue" DECIMAL(12,2),
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "nextActionDueAt" TIMESTAMP(3),
ADD COLUMN     "renewalDate" TIMESTAMP(3),
ADD COLUMN     "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ClientStageHistory" ADD COLUMN     "overrideApprovedById" TEXT,
ADD COLUMN     "overrideReason" TEXT,
ADD COLUMN     "overrideRiskAcknowledged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unmetRequirements" JSONB,
ADD COLUMN     "wasOverridden" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "EmployeeTask" ADD COLUMN     "actualHours" INTEGER,
ADD COLUMN     "blocker" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completionCriteria" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "department" "Department",
ADD COLUMN     "evidenceUrl" TEXT,
ADD COLUMN     "isClientFacing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresQa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewerId" TEXT;

-- AlterTable
ALTER TABLE "EmployeeTaskEodEntry" ADD COLUMN     "hoursSpent" INTEGER,
ADD COLUMN     "supportNeeded" TEXT;

-- AlterTable
-- `pipelineId` is added nullable here on purpose. Existing stages are
-- backfilled in the data-migration block at the end of this file, and the
-- NOT NULL constraint is applied only once every row has a value.
ALTER TABLE "PipelineStage" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isTerminal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pipelineId" TEXT,
ADD COLUMN     "slaDays" INTEGER,
ADD COLUMN     "stageKey" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "availability" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "certificationLevel" "CertificationLevel" NOT NULL DEFAULT 'OBSERVER',
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "position" "Position" NOT NULL DEFAULT 'UNASSIGNED';

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "kind" "PipelineKind" NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageRequirement" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "requirementKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "isBlocking" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'WEBSITE_FORM',
    "serviceInterest" "ServiceType",
    "budgetAmount" DECIMAL(12,2),
    "timeline" TEXT,
    "isDecisionMaker" BOOLEAN,
    "mainProblem" TEXT,
    "goal" TEXT,
    "score" INTEGER,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "stageId" TEXT,
    "assignedToId" TEXT,
    "proposalValue" DECIMAL(12,2),
    "proposalSentAt" TIMESTAMP(3),
    "decisionDate" TIMESTAMP(3),
    "objection" TEXT,
    "lostReason" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "convertedClientId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCallLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "loggedById" TEXT,
    "outcome" "CallOutcome" NOT NULL,
    "notes" TEXT,
    "durationMinutes" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "isApprover" BOOLEAN NOT NULL DEFAULT false,
    "communicationPreference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "projectManagerId" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "health" "HealthStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'NONE',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "targetLaunchDate" TIMESTAMP(3),
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "budgetedHours" INTEGER,
    "clientDependency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "dependentTaskId" TEXT NOT NULL,
    "prerequisiteTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "successful" BOOLEAN NOT NULL,
    "failureReason" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "sopReference" TEXT,
    "status" "TrainingStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "assessmentScore" INTEGER,
    "trainerId" TEXT,
    "certificationAwarded" "CertificationLevel",
    "certificationExpiresAt" TIMESTAMP(3),
    "retrainingRequired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "urgency" "NotificationUrgency" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "entityType" "ActivityEntityType",
    "entityId" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "filtersJson" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationLog" (
    "id" TEXT NOT NULL,
    "migrationName" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "previousValue" TEXT,
    "mappedValue" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_slug_key" ON "Pipeline"("slug");

-- CreateIndex
CREATE INDEX "Pipeline_kind_idx" ON "Pipeline"("kind");

-- CreateIndex
CREATE INDEX "StageRequirement_stageId_idx" ON "StageRequirement"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "StageRequirement_stageId_requirementKey_key" ON "StageRequirement"("stageId", "requirementKey");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedClientId_key" ON "Lead"("convertedClientId");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

-- CreateIndex
CREATE INDEX "Lead_stageId_idx" ON "Lead"("stageId");

-- CreateIndex
CREATE INDEX "Lead_nextFollowUpAt_idx" ON "Lead"("nextFollowUpAt");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_deletedAt_idx" ON "Lead"("deletedAt");

-- CreateIndex
CREATE INDEX "LeadCallLog_leadId_occurredAt_idx" ON "LeadCallLog"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "LeadCallLog_loggedById_idx" ON "LeadCallLog"("loggedById");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_idx" ON "ClientContact"("clientId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_projectManagerId_idx" ON "Project"("projectManagerId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_targetLaunchDate_idx" ON "Project"("targetLaunchDate");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");

-- CreateIndex
CREATE INDEX "Milestone_dueDate_idx" ON "Milestone"("dueDate");

-- CreateIndex
CREATE INDEX "TaskDependency_dependentTaskId_idx" ON "TaskDependency"("dependentTaskId");

-- CreateIndex
CREATE INDEX "TaskDependency_prerequisiteTaskId_idx" ON "TaskDependency"("prerequisiteTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_dependentTaskId_prerequisiteTaskId_key" ON "TaskDependency"("dependentTaskId", "prerequisiteTaskId");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_userId_idx" ON "UserPermissionOverride"("userId");

-- CreateIndex
CREATE INDEX "UserPermissionOverride_expiresAt_idx" ON "UserPermissionOverride"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionOverride_userId_permission_key" ON "UserPermissionOverride"("userId", "permission");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_origin_createdAt_idx" ON "LoginAttempt"("origin", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_createdAt_idx" ON "LoginAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "TrainingRecord_userId_idx" ON "TrainingRecord"("userId");

-- CreateIndex
CREATE INDEX "TrainingRecord_status_idx" ON "TrainingRecord"("status");

-- CreateIndex
CREATE INDEX "TrainingRecord_certificationExpiresAt_idx" ON "TrainingRecord"("certificationExpiresAt");

-- CreateIndex
CREATE INDEX "TrainingRecord_dueDate_idx" ON "TrainingRecord"("dueDate");

-- CreateIndex
CREATE INDEX "Notification_recipientId_readAt_idx" ON "Notification"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_recipientId_createdAt_idx" ON "Notification"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE INDEX "SavedView_ownerId_idx" ON "SavedView"("ownerId");

-- CreateIndex
CREATE INDEX "SavedView_scope_idx" ON "SavedView"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_ownerId_scope_name_key" ON "SavedView"("ownerId", "scope", "name");

-- CreateIndex
CREATE INDEX "MigrationLog_migrationName_idx" ON "MigrationLog"("migrationName");

-- CreateIndex
CREATE INDEX "MigrationLog_needsReview_idx" ON "MigrationLog"("needsReview");

-- CreateIndex
CREATE INDEX "MigrationLog_entityType_entityId_idx" ON "MigrationLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_actorId_createdAt_idx" ON "ActivityLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "Client_healthStatus_idx" ON "Client"("healthStatus");

-- CreateIndex
CREATE INDEX "Client_renewalDate_idx" ON "Client"("renewalDate");

-- CreateIndex
CREATE INDEX "Client_deletedAt_idx" ON "Client"("deletedAt");

-- CreateIndex
CREATE INDEX "ClientStageHistory_wasOverridden_idx" ON "ClientStageHistory"("wasOverridden");

-- CreateIndex
CREATE INDEX "EmployeeTask_projectId_idx" ON "EmployeeTask"("projectId");

-- CreateIndex
CREATE INDEX "EmployeeTask_reviewerId_idx" ON "EmployeeTask"("reviewerId");

-- CreateIndex
CREATE INDEX "EmployeeTask_deletedAt_idx" ON "EmployeeTask"("deletedAt");

-- CreateIndex
CREATE INDEX "PipelineStage_pipelineId_idx" ON "PipelineStage"("pipelineId");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_pipelineId_position_key" ON "PipelineStage"("pipelineId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_pipelineId_stageKey_key" ON "PipelineStage"("pipelineId", "stageKey");

-- CreateIndex
CREATE INDEX "User_position_idx" ON "User"("position");

-- CreateIndex
CREATE INDEX "User_department_idx" ON "User"("department");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageRequirement" ADD CONSTRAINT "StageRequirement_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedClientId_fkey" FOREIGN KEY ("convertedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCallLog" ADD CONSTRAINT "LeadCallLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCallLog" ADD CONSTRAINT "LeadCallLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStageHistory" ADD CONSTRAINT "ClientStageHistory_overrideApprovedById_fkey" FOREIGN KEY ("overrideApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependentTaskId_fkey" FOREIGN KEY ("dependentTaskId") REFERENCES "EmployeeTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_prerequisiteTaskId_fkey" FOREIGN KEY ("prerequisiteTaskId") REFERENCES "EmployeeTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- DATA MIGRATION
--
-- Everything below moves existing rows onto the new structure. No existing
-- value is discarded: each mapping is written to "MigrationLog", and rows that
-- need a human decision are flagged with needsReview = true.
-- ============================================================================

-- 1. Create the two pipelines the SOP requires. Fixed ids keep the seed,
--    stage-gate rules, and any future migration referring to the same rows.
INSERT INTO "Pipeline" ("id", "kind", "name", "slug", "description", "isDefault", "createdAt", "updatedAt")
VALUES
  ('pipeline_sales', 'SALES', 'Sales Pipeline', 'sales',
   'Lead capture through to a closed opportunity.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pipeline_fulfillment', 'FULFILLMENT', 'Client Journey', 'client-journey',
   'Payment received through to offboarding and archive.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 2. Every stage that existed before this migration belongs to the delivery
--    side of the business, so it moves to the fulfillment pipeline. The stage
--    keeps its name, slug, colour, and position exactly as they were.
UPDATE "PipelineStage"
SET "pipelineId" = 'pipeline_fulfillment',
    "stageKey" = COALESCE("stageKey", "slug")
WHERE "pipelineId" IS NULL;

-- 3. Record what happened to each pre-existing stage.
INSERT INTO "MigrationLog" ("id", "migrationName", "entityType", "entityId", "fieldName", "previousValue", "mappedValue", "needsReview", "note", "createdAt")
SELECT
  'mig_stage_' || "id",
  '20260806000000_sop_foundation',
  'PipelineStage',
  "id",
  'pipelineId',
  NULL,
  'pipeline_fulfillment',
  true,
  'Existing stage "' || "name" || '" was assigned to the Client Journey pipeline. '
    || 'Confirm it belongs there rather than in the Sales pipeline, and map it to '
    || 'one of the eighteen SOP journey stages.',
  CURRENT_TIMESTAMP
FROM "PipelineStage"
WHERE "pipelineId" = 'pipeline_fulfillment';

-- 4. Now that every row has a pipeline, enforce the constraint.
ALTER TABLE "PipelineStage" ALTER COLUMN "pipelineId" SET NOT NULL;

-- 5. Map existing users onto SOP positions using their job title, falling back
--    to their access tier. Anything we cannot determine confidently stays
--    UNASSIGNED, which carries the narrowest permissions, and is flagged.
UPDATE "User" SET "position" = 'AGENCY_DIRECTOR'      WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%director%';
UPDATE "User" SET "position" = 'OPERATIONS_MANAGER'   WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%operations%';
UPDATE "User" SET "position" = 'PROJECT_MANAGER'      WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%project manager%';
UPDATE "User" SET "position" = 'ACCOUNT_MANAGER'      WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%account manager%';
UPDATE "User" SET "position" = 'SALES_MANAGER'        WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%sales manager%';
UPDATE "User" SET "position" = 'SALES_REPRESENTATIVE' WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%sales%';
UPDATE "User" SET "position" = 'QA_REVIEWER'          WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%quality%';
UPDATE "User" SET "position" = 'COPYWRITER'           WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%copywriter%';
UPDATE "User" SET "position" = 'GRAPHIC_DESIGNER'     WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%designer%';
UPDATE "User" SET "position" = 'VIDEO_EDITOR'         WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%video%';
UPDATE "User" SET "position" = 'SEO_SPECIALIST'       WHERE "position" = 'UNASSIGNED' AND "jobTitle" ILIKE '%seo%';

-- 6. Record every user mapping, including the ones left for manual review.
INSERT INTO "MigrationLog" ("id", "migrationName", "entityType", "entityId", "fieldName", "previousValue", "mappedValue", "needsReview", "note", "createdAt")
SELECT
  'mig_user_' || "id",
  '20260806000000_sop_foundation',
  'User',
  "id",
  'position',
  "role"::text || ' / ' || COALESCE("jobTitle", 'no job title'),
  "position"::text,
  "position" = 'UNASSIGNED',
  CASE
    WHEN "position" = 'UNASSIGNED'
      THEN 'No confident position match. This account keeps the narrowest permissions until an administrator assigns a position.'
    ELSE 'Position derived from the existing job title. Confirm it is correct.'
  END,
  CURRENT_TIMESTAMP
FROM "User";

-- 7. Existing accounts have been in their current stage since before this
--    migration; seed stageEnteredAt from the row's last update so
--    time-in-stage reporting does not claim every account just arrived.
UPDATE "Client" SET "stageEnteredAt" = "updatedAt" WHERE "stageEnteredAt" > "updatedAt";
