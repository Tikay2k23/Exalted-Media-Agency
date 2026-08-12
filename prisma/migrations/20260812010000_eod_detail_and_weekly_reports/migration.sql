-- End-of-day detail, and the weekly report built from it.
--
-- Everything added is nullable or defaulted, one column is widened rather than
-- replaced, and nothing is dropped. The running application keeps working
-- against this schema before the new code ships.

-- 1. Hours to the half hour.
--
--    hoursSpent was an integer, so "2.5 hours" was not expressible and people
--    rounded. Widening int to double precision is lossless - every value
--    already stored converts exactly - and Float rather than Decimal on
--    purpose, because Decimal does not survive the trip to a client component.
ALTER TABLE "EmployeeTaskEodEntry"
  ALTER COLUMN "hoursSpent" TYPE DOUBLE PRECISION;

-- 2. What the entry could not previously record.
ALTER TABLE "EmployeeTaskEodEntry" ADD COLUMN "progressPercent" INTEGER;
ALTER TABLE "EmployeeTaskEodEntry" ADD COLUMN "workLink" TEXT;
ALTER TABLE "EmployeeTaskEodEntry" ADD COLUMN "taskStatus" "EmployeeTaskStatus";

-- 3. The weekly report.
CREATE TYPE "WeeklyReportStatus" AS ENUM (
  'NOT_STARTED',
  'DRAFT',
  'SUBMITTED',
  'NEEDS_CHANGES',
  'APPROVED'
);

CREATE TABLE "WeeklyReport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekStartDate" TIMESTAMP(3) NOT NULL,
  "status" "WeeklyReportStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "summary" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "managerNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- One report per person per week. This is what makes "submit" idempotent:
-- there is exactly one row to move through the statuses.
CREATE UNIQUE INDEX "WeeklyReport_userId_weekStartDate_key"
  ON "WeeklyReport"("userId", "weekStartDate");
CREATE INDEX "WeeklyReport_weekStartDate_status_idx"
  ON "WeeklyReport"("weekStartDate", "status");
CREATE INDEX "WeeklyReport_userId_idx" ON "WeeklyReport"("userId");

ALTER TABLE "WeeklyReport"
  ADD CONSTRAINT "WeeklyReport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeeklyReport"
  ADD CONSTRAINT "WeeklyReport_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Somewhere to configure the reporting deadline.
--
--    A table rather than an environment variable, because when reports are due
--    is an operational decision somebody should be able to change without a
--    deploy.
CREATE TABLE "WorkspaceSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkspaceSetting_pkey" PRIMARY KEY ("key")
);

-- Friday at five is the starting position, not a hard-coded rule: it lives in
-- a row that can be edited. 5 is Friday, counting Monday as 1.
INSERT INTO "WorkspaceSetting" ("key", "value", "updatedAt")
VALUES
  ('weeklyReport.dueWeekday', '5', CURRENT_TIMESTAMP),
  ('weeklyReport.dueTime', '17:00', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

-- 5. Progress on entries that predate the column.
--
--    Deliberately left null rather than guessed. An entry written before there
--    was anywhere to record progress did not record it, and inventing a number
--    would put a figure in the history that nobody ever reported. The trail
--    shows a gap, which is the truth.
INSERT INTO "MigrationLog" (
  "id", "migrationName", "entityType", "entityId", "fieldName",
  "previousValue", "mappedValue", "needsReview", "note"
)
SELECT
  gen_random_uuid()::text,
  '20260812010000_eod_detail_and_weekly_reports',
  'EmployeeTaskEodEntry',
  "id",
  'progressPercent',
  NULL,
  NULL,
  false,
  'Entry predates the progress field. Left null rather than guessed.'
FROM "EmployeeTaskEodEntry";
