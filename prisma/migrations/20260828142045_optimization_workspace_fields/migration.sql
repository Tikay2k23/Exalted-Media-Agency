-- CreateEnum
CREATE TYPE "OptimizationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable
ALTER TABLE "ClientHealthAssessment" ADD COLUMN     "factorsJson" JSONB,
ADD COLUMN     "risks" TEXT,
ADD COLUMN     "strengths" TEXT;

-- AlterTable
ALTER TABLE "Optimization" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "cancelledReason" TEXT,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "metricAfter" TEXT,
ADD COLUMN     "metricBefore" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "priority" "OptimizationPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "serviceType" "ServiceType",
ADD COLUMN     "taskId" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateIndex
CREATE INDEX "Optimization_clientId_priority_idx" ON "Optimization"("clientId", "priority");

-- CreateIndex
CREATE INDEX "Optimization_taskId_idx" ON "Optimization"("taskId");

-- AddForeignKey
ALTER TABLE "Optimization" ADD CONSTRAINT "Optimization_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Optimization" ADD CONSTRAINT "Optimization_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Optimization" ADD CONSTRAINT "Optimization_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Optimization" ADD CONSTRAINT "Optimization_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EmployeeTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
