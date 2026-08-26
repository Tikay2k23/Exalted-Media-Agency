-- CreateEnum
CREATE TYPE "FlagSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FlagImpact" AS ENUM ('BLOCKS_STAGE', 'DELAYS_MILESTONE', 'NO_BLOCK');

-- AlterTable
--
-- All nullable or defaulted: existing flags keep working untouched, and a
-- waiting record raised before any of this simply has no severity to give.
ALTER TABLE "ClientJourneyFlag"
  ADD COLUMN     "stageId" TEXT,
  ADD COLUMN     "requirementKey" TEXT,
  ADD COLUMN     "taskId" TEXT,
  ADD COLUMN     "contactId" TEXT,
  ADD COLUMN     "lastFollowUpAt" TIMESTAMP(3),
  ADD COLUMN     "followUpCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "receivedAt" TIMESTAMP(3),
  ADD COLUMN     "cancelledAt" TIMESTAMP(3),
  ADD COLUMN     "severity" "FlagSeverity",
  ADD COLUMN     "impact" "FlagImpact",
  ADD COLUMN     "expectedResolutionAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ClientJourneyFlag_taskId_idx" ON "ClientJourneyFlag"("taskId");

-- CreateIndex
CREATE INDEX "ClientJourneyFlag_contactId_idx" ON "ClientJourneyFlag"("contactId");

-- AddForeignKey
ALTER TABLE "ClientJourneyFlag" ADD CONSTRAINT "ClientJourneyFlag_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJourneyFlag" ADD CONSTRAINT "ClientJourneyFlag_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EmployeeTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJourneyFlag" ADD CONSTRAINT "ClientJourneyFlag_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
