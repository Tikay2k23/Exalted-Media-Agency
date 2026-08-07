-- CreateEnum
CREATE TYPE "ApprovalRecordStatus" AS ENUM ('RECORDED', 'WITHDRAWN');

-- AlterTable
-- Additive only. Existing rows keep every value they had and become RECORDED,
-- which is what they already meant before the column existed.
ALTER TABLE "Approval"
  ADD COLUMN "status"          "ApprovalRecordStatus" NOT NULL DEFAULT 'RECORDED',
  ADD COLUMN "withdrawnAt"     TIMESTAMP(3),
  ADD COLUMN "withdrawnById"   TEXT,
  ADD COLUMN "withdrawnReason" TEXT;

-- CreateIndex
CREATE INDEX "Approval_clientId_status_idx" ON "Approval"("clientId", "status");

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_withdrawnById_fkey"
  FOREIGN KEY ("withdrawnById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Backfill the approver-name snapshot.
--
-- The register is the evidence that a client signed off. The contact relation
-- is SetNull on delete, so an approval whose contact is later removed would
-- otherwise forget who gave it. Rows that already name someone are left alone.
-- ============================================================================

UPDATE "Approval" a
SET "approvedByName" = c."name"
FROM "ClientContact" c
WHERE a."approverContactId" = c."id"
  AND (a."approvedByName" IS NULL OR btrim(a."approvedByName") = '');

INSERT INTO "MigrationLog" ("id", "migrationName", "entityType", "entityId", "fieldName", "previousValue", "mappedValue", "needsReview", "note", "createdAt")
SELECT
  'mig_appr_' || "id",
  '20260807000000_client_approval_register',
  'Approval',
  "id",
  'status',
  NULL,
  'RECORDED',
  -- An approval with neither a named approver nor evidence cannot be verified
  -- after the fact. It is kept, but somebody should confirm it is real before
  -- a launch is allowed to rest on it.
  ("approverContactId" IS NULL AND ("approvedByName" IS NULL OR btrim("approvedByName") = ''))
    OR (("evidenceUrl" IS NULL OR btrim("evidenceUrl") = '') AND ("notes" IS NULL OR btrim("notes") = '')),
  'Existing approval adopted as RECORDED. Approvals with no named approver or '
    || 'no evidence no longer satisfy the launch gate and are flagged here.',
  CURRENT_TIMESTAMP
FROM "Approval";
