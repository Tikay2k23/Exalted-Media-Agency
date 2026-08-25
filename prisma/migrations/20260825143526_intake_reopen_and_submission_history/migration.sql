-- AlterEnum
ALTER TYPE "IntakeStatus" ADD VALUE 'REOPENED';

-- AlterTable
ALTER TABLE "IntakeForm" ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "reopenedById" TEXT;

-- CreateTable
CREATE TABLE "IntakeSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntakeSubmission_formId_idx" ON "IntakeSubmission"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeSubmission_formId_version_key" ON "IntakeSubmission"("formId", "version");

-- AddForeignKey
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeSubmission" ADD CONSTRAINT "IntakeSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "IntakeForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the forms already submitted become version 1 of their own history.
-- Without this, a client who submitted before this table existed would look as
-- though they had never sent anything, and the first reopen would make their
-- original answers the thing being edited with no record of what they sent.
INSERT INTO "IntakeSubmission" ("id", "formId", "version", "answers", "submittedAt")
SELECT
  gen_random_uuid()::text,
  "id",
  1,
  "answers",
  "submittedAt"
FROM "IntakeForm"
WHERE "submittedAt" IS NOT NULL
  AND "answers" IS NOT NULL;
