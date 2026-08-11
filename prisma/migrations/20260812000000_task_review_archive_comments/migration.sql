-- Review, archive and comments for agency tasks.
--
-- Every column added here is nullable and every default is a no-op, so the
-- running application keeps working against this schema before the new code
-- ships. Nothing is dropped and nothing is renamed.

-- 1. The review record. Approval is stored apart from completion on purpose:
--    "who signed this off" and "when did it finish" are different questions and
--    a single timestamp cannot answer both.
ALTER TABLE "EmployeeTask" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "EmployeeTask" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "EmployeeTask" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "EmployeeTask" ADD COLUMN "revisionNote" TEXT;

-- 2. Archiving. A row nobody wants on the board but everybody wants in the
--    reports.
ALTER TABLE "EmployeeTask" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "EmployeeTask" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "EmployeeTask"
  ADD CONSTRAINT "EmployeeTask_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeTask"
  ADD CONSTRAINT "EmployeeTask_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EmployeeTask_archivedAt_idx" ON "EmployeeTask"("archivedAt");
CREATE INDEX "EmployeeTask_approvedById_idx" ON "EmployeeTask"("approvedById");

-- 3. Comments, tied to the task rather than to an inbox.
CREATE TABLE "TaskComment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isRevisionNote" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");
CREATE INDEX "TaskComment_authorId_idx" ON "TaskComment"("authorId");

ALTER TABLE "TaskComment"
  ADD CONSTRAINT "TaskComment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "EmployeeTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment"
  ADD CONSTRAINT "TaskComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Finished work with no completion date.
--
--    Tasks were being marked done before there was anywhere to record when.
--    The completed view reads completedAt, so those rows would show a finished
--    task with a blank date. updatedAt is the closest honest approximation -
--    the last write to a finished task is almost always the one that finished
--    it - so it is used, logged row by row, and flagged for review rather than
--    presented as fact.
INSERT INTO "MigrationLog" (
  "id", "migrationName", "entityType", "entityId", "fieldName",
  "previousValue", "mappedValue", "needsReview", "note"
)
SELECT
  gen_random_uuid()::text,
  '20260812000000_task_review_archive_comments',
  'EmployeeTask',
  "id",
  'completedAt',
  NULL,
  "updatedAt"::text,
  true,
  'Task was already ' || "status"::text || ' with no completion date. Backfilled from updatedAt, which is an approximation.'
FROM "EmployeeTask"
WHERE "status" IN ('APPROVED', 'DONE')
  AND "completedAt" IS NULL
  AND "deletedAt" IS NULL;

UPDATE "EmployeeTask"
SET "completedAt" = "updatedAt"
WHERE "status" IN ('APPROVED', 'DONE')
  AND "completedAt" IS NULL
  AND "deletedAt" IS NULL;

-- Approval is deliberately NOT backfilled. Nobody knows who approved this work,
-- and inventing an approver would put a name against a decision they never
-- made. These rows show completion without approval, which is the truth.
