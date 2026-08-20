-- CreateEnum
CREATE TYPE "HandoffPaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "HandoffState" AS ENUM ('AWAITING_PAYMENT', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "LeadHandoff" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "clientId" TEXT,
    "state" "HandoffState" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "serviceType" "ServiceType" NOT NULL,
    "finalValue" DECIMAL(12,2),
    "contractStatus" "AgreementStatus" NOT NULL DEFAULT 'NOT_SENT',
    "paymentStatus" "HandoffPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "expectedStartDate" TIMESTAMP(3),
    "handoffNote" TEXT,
    "projectManagerId" TEXT,
    "paymentConfirmedAt" TIMESTAMP(3),
    "paymentConfirmedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "clientLinkedAt" TIMESTAMP(3),
    "billingRecordedAt" TIMESTAMP(3),
    "onboardingCreatedAt" TIMESTAMP(3),
    "tasksCreatedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "failedStep" TEXT,
    "failureMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadHandoff_leadId_key" ON "LeadHandoff"("leadId");

-- CreateIndex
CREATE INDEX "LeadHandoff_state_idx" ON "LeadHandoff"("state");

-- CreateIndex
CREATE INDEX "LeadHandoff_clientId_idx" ON "LeadHandoff"("clientId");

-- CreateIndex
CREATE INDEX "LeadHandoff_paymentStatus_idx" ON "LeadHandoff"("paymentStatus");

-- AddForeignKey
ALTER TABLE "LeadHandoff" ADD CONSTRAINT "LeadHandoff_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHandoff" ADD CONSTRAINT "LeadHandoff_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHandoff" ADD CONSTRAINT "LeadHandoff_projectManagerId_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadHandoff" ADD CONSTRAINT "LeadHandoff_paymentConfirmedById_fkey" FOREIGN KEY ("paymentConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
