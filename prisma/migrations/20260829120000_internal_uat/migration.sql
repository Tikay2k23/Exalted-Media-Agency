-- Internal UAT: reusable test cases, and every execution of them.
CREATE TYPE "UatStatus" AS ENUM ('NOT_TESTED', 'TESTING', 'PASSED', 'FAILED', 'BLOCKED', 'RETEST_REQUIRED');
CREATE TYPE "UatSeverity" AS ENUM ('P0', 'P1', 'P2', 'P3');
CREATE TYPE "UatEnvironment" AS ENUM ('DEVELOPMENT', 'STAGING', 'UAT', 'PRODUCTION');

CREATE TABLE "UatTestCase" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT,
    "preconditions" TEXT,
    "steps" TEXT NOT NULL,
    "expectedResult" TEXT NOT NULL,
    "severity" "UatSeverity" NOT NULL DEFAULT 'P2',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UatTestCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UatTestRun" (
    "id" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "runNumber" INTEGER NOT NULL,
    "status" "UatStatus" NOT NULL,
    "actualResult" TEXT,
    "severity" "UatSeverity",
    "blockedReason" TEXT,
    "evidenceUrl" TEXT,
    "notes" TEXT,
    "environment" "UatEnvironment" NOT NULL DEFAULT 'DEVELOPMENT',
    "testerId" TEXT,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UatTestRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UatTestCase_reference_key" ON "UatTestCase"("reference");
CREATE INDEX "UatTestCase_module_idx" ON "UatTestCase"("module");
CREATE INDEX "UatTestCase_severity_idx" ON "UatTestCase"("severity");

-- One run number per case: two testers cannot both create "run 3".
CREATE UNIQUE INDEX "UatTestRun_testCaseId_runNumber_key" ON "UatTestRun"("testCaseId", "runNumber");
CREATE INDEX "UatTestRun_status_idx" ON "UatTestRun"("status");
CREATE INDEX "UatTestRun_severity_idx" ON "UatTestRun"("severity");
CREATE INDEX "UatTestRun_testedAt_idx" ON "UatTestRun"("testedAt");

ALTER TABLE "UatTestCase" ADD CONSTRAINT "UatTestCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UatTestRun" ADD CONSTRAINT "UatTestRun_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "UatTestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UatTestRun" ADD CONSTRAINT "UatTestRun_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UatTestRun" ADD CONSTRAINT "UatTestRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EmployeeTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
