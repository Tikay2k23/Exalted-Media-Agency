-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('HOW_TO_GUIDE', 'SCRIPT', 'TEMPLATE', 'CHECKLIST', 'REFERENCE_GUIDE', 'FILE', 'EXTERNAL_LINK');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResourceSource" AS ENUM ('DOCUMENT', 'FILE', 'LINK');

-- DropIndex
DROP INDEX "Client_archivedAt_idx";

-- DropIndex
DROP INDEX "UatTestCase_releaseScope_idx";

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "description" TEXT,
    "status" "ResourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "ResourceSource" NOT NULL,
    "content" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "fileMimeType" TEXT,
    "fileSize" INTEGER,
    "externalUrl" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceSopLink" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "sopId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceSopLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Resource_type_idx" ON "Resource"("type");

-- CreateIndex
CREATE INDEX "Resource_status_idx" ON "Resource"("status");

-- CreateIndex
CREATE INDEX "Resource_ownerId_idx" ON "Resource"("ownerId");

-- CreateIndex
CREATE INDEX "ResourceSopLink_sopId_idx" ON "ResourceSopLink"("sopId");

-- CreateIndex
CREATE INDEX "ResourceSopLink_resourceId_idx" ON "ResourceSopLink"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ResourceSopLink_resourceId_sopId_key" ON "ResourceSopLink"("resourceId", "sopId");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceSopLink" ADD CONSTRAINT "ResourceSopLink_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceSopLink" ADD CONSTRAINT "ResourceSopLink_sopId_fkey" FOREIGN KEY ("sopId") REFERENCES "Sop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceSopLink" ADD CONSTRAINT "ResourceSopLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

