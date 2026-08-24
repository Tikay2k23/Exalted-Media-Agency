-- CreateEnum
CREATE TYPE "StrategySectionStatus" AS ENUM ('NOT_REQUIRED', 'NOT_STARTED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'APPROVED');

-- CreateEnum
CREATE TYPE "StrategySectionKey" AS ENUM ('BUSINESS_GOALS', 'TARGET_AUDIENCE', 'OFFER', 'VALUE_PROPOSITION', 'COMPETITIVE_POSITIONING', 'BRAND_FOUNDATION', 'ACQUISITION_STRATEGY', 'CHANNEL_STRATEGY', 'FUNNEL_STRATEGY', 'TRACKING_MEASUREMENT', 'EXECUTION_ROADMAP');

-- CreateEnum
CREATE TYPE "StrategyGoalStatus" AS ENUM ('PROPOSED', 'AGREED', 'IN_PROGRESS', 'ACHIEVED', 'DROPPED');

-- CreateEnum
CREATE TYPE "StrategyPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AudienceTier" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "RoadmapPhaseKey" AS ENUM ('DISCOVERY', 'RESEARCH_ANALYSIS', 'STRATEGY_DEVELOPMENT', 'PLANNING_EXECUTION', 'REVIEW_OPTIMIZATION');

-- CreateEnum
CREATE TYPE "RoadmapPhaseStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ClientNoteCategory" AS ENUM ('GENERAL', 'STRATEGY');

-- CreateTable
CREATE TABLE "StrategySection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" "StrategySectionKey" NOT NULL,
    "status" "StrategySectionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "ownerId" TEXT,
    "notes" TEXT,
    "updatedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyGoal" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "metric" TEXT,
    "baseline" TEXT,
    "target" TEXT,
    "targetDate" TIMESTAMP(3),
    "priority" "StrategyPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "StrategyGoalStatus" NOT NULL DEFAULT 'PROPOSED',
    "ownerId" TEXT,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyAudience" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tier" "AudienceTier" NOT NULL DEFAULT 'PRIMARY',
    "name" TEXT NOT NULL,
    "location" TEXT,
    "attributes" TEXT,
    "needs" TEXT,
    "painPoints" TEXT,
    "buyingTriggers" TEXT,
    "objections" TEXT,
    "decisionMakers" TEXT,
    "channels" TEXT,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyValueProp" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "statement" TEXT,
    "offer" TEXT,
    "primaryOutcome" TEXT,
    "differentiators" TEXT[],
    "proofPoints" TEXT,
    "guarantees" TEXT,
    "objections" TEXT,
    "positioningStatement" TEXT,
    "competitorNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyValueProp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyRoadmapPhase" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" "RoadmapPhaseKey" NOT NULL,
    "status" "RoadmapPhaseStatus" NOT NULL DEFAULT 'PENDING',
    "ownerId" TEXT,
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyRoadmapPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "category" "ClientNoteCategory" NOT NULL DEFAULT 'GENERAL',
    "body" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StrategySection_clientId_idx" ON "StrategySection"("clientId");

-- CreateIndex
CREATE INDEX "StrategySection_status_idx" ON "StrategySection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StrategySection_clientId_key_key" ON "StrategySection"("clientId", "key");

-- CreateIndex
CREATE INDEX "StrategyGoal_clientId_idx" ON "StrategyGoal"("clientId");

-- CreateIndex
CREATE INDEX "StrategyGoal_status_idx" ON "StrategyGoal"("status");

-- CreateIndex
CREATE INDEX "StrategyAudience_clientId_idx" ON "StrategyAudience"("clientId");

-- CreateIndex
CREATE INDEX "StrategyAudience_tier_idx" ON "StrategyAudience"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyValueProp_clientId_key" ON "StrategyValueProp"("clientId");

-- CreateIndex
CREATE INDEX "StrategyRoadmapPhase_clientId_idx" ON "StrategyRoadmapPhase"("clientId");

-- CreateIndex
CREATE INDEX "StrategyRoadmapPhase_status_idx" ON "StrategyRoadmapPhase"("status");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyRoadmapPhase_clientId_key_key" ON "StrategyRoadmapPhase"("clientId", "key");

-- CreateIndex
CREATE INDEX "ClientNote_clientId_category_idx" ON "ClientNote"("clientId", "category");

-- CreateIndex
CREATE INDEX "ClientNote_deletedAt_idx" ON "ClientNote"("deletedAt");

-- AddForeignKey
ALTER TABLE "StrategySection" ADD CONSTRAINT "StrategySection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategySection" ADD CONSTRAINT "StrategySection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategySection" ADD CONSTRAINT "StrategySection_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategySection" ADD CONSTRAINT "StrategySection_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyGoal" ADD CONSTRAINT "StrategyGoal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyGoal" ADD CONSTRAINT "StrategyGoal_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyAudience" ADD CONSTRAINT "StrategyAudience_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyValueProp" ADD CONSTRAINT "StrategyValueProp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRoadmapPhase" ADD CONSTRAINT "StrategyRoadmapPhase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRoadmapPhase" ADD CONSTRAINT "StrategyRoadmapPhase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
