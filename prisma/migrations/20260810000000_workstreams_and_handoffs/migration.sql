-- CreateEnum
CREATE TYPE "WorkstreamStage" AS ENUM ('ASSIGNED', 'WAITING_ON_ACCESS', 'WAITING_ON_ASSETS', 'READY', 'IN_PROGRESS', 'SELF_REVIEW', 'INTERNAL_REVIEW', 'QA_CORRECTIONS', 'READY_TO_SHIP', 'LIVE', 'COMPLETE', 'NOT_REQUIRED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "currentOwnerId" TEXT,
ADD COLUMN     "currentOwnerRole" "TeamRole";

-- CreateTable
CREATE TABLE "ClientWorkstream" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL,
    "stage" "WorkstreamStage" NOT NULL DEFAULT 'ASSIGNED',
    "ownerId" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientWorkstream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientHandoff" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fromRole" "TeamRole",
    "toRole" "TeamRole" NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "stageKey" TEXT NOT NULL,
    "note" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "handedOffAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handedOffById" TEXT,

    CONSTRAINT "ClientHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientWorkstream_role_stage_idx" ON "ClientWorkstream"("role", "stage");

-- CreateIndex
CREATE INDEX "ClientWorkstream_ownerId_idx" ON "ClientWorkstream"("ownerId");

-- CreateIndex
CREATE INDEX "ClientWorkstream_stage_idx" ON "ClientWorkstream"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "ClientWorkstream_clientId_role_key" ON "ClientWorkstream"("clientId", "role");

-- CreateIndex
CREATE INDEX "ClientHandoff_clientId_handedOffAt_idx" ON "ClientHandoff"("clientId", "handedOffAt");

-- CreateIndex
CREATE INDEX "ClientHandoff_toUserId_idx" ON "ClientHandoff"("toUserId");

-- CreateIndex
CREATE INDEX "ClientHandoff_toRole_idx" ON "ClientHandoff"("toRole");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_currentOwnerId_fkey" FOREIGN KEY ("currentOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientWorkstream" ADD CONSTRAINT "ClientWorkstream_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientWorkstream" ADD CONSTRAINT "ClientWorkstream_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHandoff" ADD CONSTRAINT "ClientHandoff_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHandoff" ADD CONSTRAINT "ClientHandoff_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHandoff" ADD CONSTRAINT "ClientHandoff_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHandoff" ADD CONSTRAINT "ClientHandoff_handedOffById_fkey" FOREIGN KEY ("handedOffById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- Backfill the current owner for accounts that already exist.
--
-- Additive: nothing is deleted and no existing column changes meaning. An
-- account that already has an assigned teammate is held by that person in the
-- seat they actually occupy, which is the truthful reading of today's data.
-- Accounts with nobody assigned are left null, because "unowned" is a real
-- state worth seeing rather than one to paper over with a default.
-- ============================================================================

UPDATE "Client" c
SET "currentOwnerId" = c."assignedUserId",
    "currentOwnerRole" = u."teamRole"
FROM "User" u
WHERE c."assignedUserId" = u."id"
  AND c."currentOwnerId" IS NULL
  AND c."deletedAt" IS NULL;

INSERT INTO "MigrationLog" ("id", "migrationName", "entityType", "entityId", "fieldName", "previousValue", "mappedValue", "needsReview", "note", "createdAt")
SELECT
  'mig_owner_' || c."id",
  '20260810000000_workstreams_and_handoffs',
  'Client',
  c."id",
  'currentOwnerRole',
  NULL,
  COALESCE(c."currentOwnerRole"::text, 'UNOWNED'),
  -- An account nobody is assigned to cannot have a current owner derived, so
  -- somebody has to look at it.
  c."currentOwnerId" IS NULL,
  'Current owner seeded from the standing account assignee. Workstreams are '
    || 'created when the purchased service blueprint is applied.',
  CURRENT_TIMESTAMP
FROM "Client" c
WHERE c."deletedAt" IS NULL;
