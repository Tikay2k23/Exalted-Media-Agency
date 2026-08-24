-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "businessEmail" TEXT,
ADD COLUMN     "businessPhone" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "serviceArea" TEXT,
ADD COLUMN     "stateRegion" TEXT,
ADD COLUMN     "taxId" TEXT,
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "ClientContact" ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "deactivatedById" TEXT,
ADD COLUMN     "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentTerms" TEXT;

-- CreateIndex
CREATE INDEX "ClientContact_status_idx" ON "ClientContact"("status");

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
