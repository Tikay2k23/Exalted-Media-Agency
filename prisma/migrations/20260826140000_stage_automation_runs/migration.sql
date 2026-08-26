-- CreateEnum
CREATE TYPE "AutomationAction" AS ENUM ('SYNC_WORKSTREAMS', 'GENERATE_TASKS', 'RECORD_HANDOFF', 'NOTIFY');

-- CreateEnum
CREATE TYPE "AutomationStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "StageAutomationRun" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "historyId" TEXT,
    "action" "AutomationAction" NOT NULL,
    "status" "AutomationStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "generatedIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StageAutomationRun_clientId_createdAt_idx" ON "StageAutomationRun"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "StageAutomationRun_historyId_idx" ON "StageAutomationRun"("historyId");

-- CreateIndex
CREATE INDEX "StageAutomationRun_status_idx" ON "StageAutomationRun"("status");

-- AddForeignKey
ALTER TABLE "StageAutomationRun" ADD CONSTRAINT "StageAutomationRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageAutomationRun" ADD CONSTRAINT "StageAutomationRun_historyId_fkey" FOREIGN KEY ("historyId") REFERENCES "ClientStageHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
