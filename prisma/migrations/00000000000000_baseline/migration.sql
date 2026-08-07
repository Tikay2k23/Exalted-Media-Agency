-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'TEAM_MEMBER');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('ACCOUNT_MANAGEMENT', 'CONTENT', 'CREATIVE', 'DESIGN', 'PAID_MEDIA', 'SEO', 'EMAIL_MARKETING', 'WEB_DEVELOPMENT', 'ANALYTICS', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'AT_RISK', 'ON_HOLD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('SOCIAL_MEDIA_MANAGEMENT', 'CONTENT_PRODUCTION', 'PAID_ADVERTISING', 'BRAND_STRATEGY', 'WEBSITE_SUPPORT');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'X', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "SocialTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING_ON_CLIENT', 'REVIEW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EmployeeTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('CONTENT_CALENDAR', 'COPYWRITING', 'CREATIVE_PRODUCTION', 'PAID_MEDIA_OPTIMIZATION', 'SEO_AUDIT', 'EMAIL_CAMPAIGN', 'CLIENT_REPORTING', 'COMMUNITY_MANAGEMENT', 'WEBSITE_UPDATE', 'ANALYTICS_REVIEW', 'INTERNAL_OPERATIONS');

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('USER', 'CLIENT', 'PIPELINE', 'SOCIAL_TASK', 'AUTH', 'REPORT', 'EMPLOYEE_TASK');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "department" "Department" NOT NULL DEFAULT 'CONTENT',
    "jobTitle" TEXT,
    "weeklyCapacityHours" INTEGER NOT NULL DEFAULT 40,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "assignedUserId" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "dateAdded" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "serviceType" "ServiceType" NOT NULL,
    "currentStageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientStageHistory" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromStageId" TEXT,
    "toStageId" TEXT NOT NULL,
    "changedById" TEXT,
    "note" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMediaTask" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "plannedPosts" INTEGER NOT NULL,
    "completedPosts" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "SocialTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "assignedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialMediaTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "status" "EmployeeTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" "TaskCategory" NOT NULL DEFAULT 'INTERNAL_OPERATIONS',
    "estimatedHours" INTEGER NOT NULL DEFAULT 2,
    "weekStartDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTaskEodEntry" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "blockers" TEXT,
    "nextSteps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTaskEodEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" "ActivityEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_slug_key" ON "PipelineStage"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_position_key" ON "PipelineStage"("position");

-- CreateIndex
CREATE INDEX "PipelineStage_position_idx" ON "PipelineStage"("position");

-- CreateIndex
CREATE INDEX "Client_assignedUserId_idx" ON "Client"("assignedUserId");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_currentStageId_idx" ON "Client"("currentStageId");

-- CreateIndex
CREATE INDEX "ClientStageHistory_clientId_idx" ON "ClientStageHistory"("clientId");

-- CreateIndex
CREATE INDEX "ClientStageHistory_changedById_idx" ON "ClientStageHistory"("changedById");

-- CreateIndex
CREATE INDEX "ClientStageHistory_changedAt_idx" ON "ClientStageHistory"("changedAt");

-- CreateIndex
CREATE INDEX "SocialMediaTask_clientId_idx" ON "SocialMediaTask"("clientId");

-- CreateIndex
CREATE INDEX "SocialMediaTask_assignedUserId_idx" ON "SocialMediaTask"("assignedUserId");

-- CreateIndex
CREATE INDEX "SocialMediaTask_dueDate_idx" ON "SocialMediaTask"("dueDate");

-- CreateIndex
CREATE INDEX "SocialMediaTask_status_idx" ON "SocialMediaTask"("status");

-- CreateIndex
CREATE INDEX "EmployeeTask_assignedToId_idx" ON "EmployeeTask"("assignedToId");

-- CreateIndex
CREATE INDEX "EmployeeTask_createdById_idx" ON "EmployeeTask"("createdById");

-- CreateIndex
CREATE INDEX "EmployeeTask_clientId_idx" ON "EmployeeTask"("clientId");

-- CreateIndex
CREATE INDEX "EmployeeTask_status_idx" ON "EmployeeTask"("status");

-- CreateIndex
CREATE INDEX "EmployeeTask_dueDate_idx" ON "EmployeeTask"("dueDate");

-- CreateIndex
CREATE INDEX "EmployeeTask_weekStartDate_idx" ON "EmployeeTask"("weekStartDate");

-- CreateIndex
CREATE INDEX "EmployeeTaskEodEntry_taskId_entryDate_idx" ON "EmployeeTaskEodEntry"("taskId", "entryDate");

-- CreateIndex
CREATE INDEX "EmployeeTaskEodEntry_authorId_entryDate_idx" ON "EmployeeTaskEodEntry"("authorId", "entryDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeTaskEodEntry_taskId_authorId_entryDate_key" ON "EmployeeTaskEodEntry"("taskId", "authorId", "entryDate");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStageHistory" ADD CONSTRAINT "ClientStageHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStageHistory" ADD CONSTRAINT "ClientStageHistory_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStageHistory" ADD CONSTRAINT "ClientStageHistory_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStageHistory" ADD CONSTRAINT "ClientStageHistory_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "PipelineStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMediaTask" ADD CONSTRAINT "SocialMediaTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialMediaTask" ADD CONSTRAINT "SocialMediaTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTask" ADD CONSTRAINT "EmployeeTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTaskEodEntry" ADD CONSTRAINT "EmployeeTaskEodEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTaskEodEntry" ADD CONSTRAINT "EmployeeTaskEodEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EmployeeTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
