-- CreateEnum
CREATE TYPE "JourneyFlagKind" AS ENUM ('WAITING_ON_CLIENT', 'BLOCKED', 'REVISIONS_REQUIRED', 'PAUSED');

-- CreateTable
CREATE TABLE "ClientJourneyFlag" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "JourneyFlagKind" NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "responsibleParty" TEXT,
    "dueAt" TIMESTAMP(3),
    "round" INTEGER,
    "raisedById" TEXT,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientJourneyFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientJourneyFlag_clientId_resolvedAt_idx" ON "ClientJourneyFlag"("clientId", "resolvedAt");

-- CreateIndex
CREATE INDEX "ClientJourneyFlag_kind_idx" ON "ClientJourneyFlag"("kind");

-- CreateIndex
CREATE INDEX "ClientJourneyFlag_dueAt_idx" ON "ClientJourneyFlag"("dueAt");

-- AddForeignKey
ALTER TABLE "ClientJourneyFlag" ADD CONSTRAINT "ClientJourneyFlag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJourneyFlag" ADD CONSTRAINT "ClientJourneyFlag_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientJourneyFlag" ADD CONSTRAINT "ClientJourneyFlag_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
