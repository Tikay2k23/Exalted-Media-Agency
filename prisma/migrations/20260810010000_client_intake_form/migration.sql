-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('NOT_SENT', 'SENT', 'VIEWED', 'PARTIALLY_COMPLETED', 'SUBMITTED', 'REVIEWED');

-- CreateTable
CREATE TABLE "IntakeForm" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "IntakeStatus" NOT NULL DEFAULT 'NOT_SENT',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "answers" JSONB,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "viewedAt" TIMESTAMP(3),
    "lastSavedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntakeForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntakeForm_clientId_key" ON "IntakeForm"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeForm_token_key" ON "IntakeForm"("token");

-- CreateIndex
CREATE INDEX "IntakeForm_status_idx" ON "IntakeForm"("status");

-- CreateIndex
CREATE INDEX "IntakeForm_expiresAt_idx" ON "IntakeForm"("expiresAt");

-- AddForeignKey
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeForm" ADD CONSTRAINT "IntakeForm_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

