-- What a salesperson needs a lead to remember.
--
-- Every column is nullable and nothing is dropped, so the running application
-- keeps working against this schema before the new code ships. The existing
-- free-text lostReason is deliberately left alone: the coded reason is added
-- beside it rather than replacing it, so nothing already written is lost.

CREATE TYPE "LostReason" AS ENUM (
  'NO_RESPONSE',
  'NO_BUDGET',
  'NOT_INTERESTED',
  'WENT_WITH_COMPETITOR',
  'BAD_FIT',
  'OUTSIDE_SERVICE_AREA',
  'TIMING',
  'DUPLICATE_LEAD',
  'OTHER'
);

CREATE TYPE "StrategyCallStatus" AS ENUM (
  'BOOKED',
  'SHOWED',
  'NO_SHOW',
  'CANCELLED',
  'RESCHEDULED'
);

-- 1. The next move, in words. Separate from the date on purpose: "call the
--    decision maker" and "Thursday at ten" are different facts, and a pipeline
--    that only stores the date says when to act without saying what to do.
ALTER TABLE "Lead" ADD COLUMN "nextAction" TEXT;

-- 2. When anybody last actually reached this person. Stored rather than derived
--    from call logs, because an email or a text is contact too, and a lead
--    chased three ways would otherwise read as never contacted.
ALTER TABLE "Lead" ADD COLUMN "lastContactAt" TIMESTAMP(3);

-- 3. The strategy call, which is the hinge of this pipeline.
ALTER TABLE "Lead" ADD COLUMN "strategyCallAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "strategyCallStatus" "StrategyCallStatus";

-- 4. The outcome, recorded on the lead so a converted opportunity can still
--    answer "who closed this, when, and for how much" after the client record
--    takes over.
ALTER TABLE "Lead" ADD COLUMN "wonAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "wonById" TEXT;
ALTER TABLE "Lead" ADD COLUMN "finalValue" DECIMAL(12,2);
ALTER TABLE "Lead" ADD COLUMN "lostAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "lostReasonCode" "LostReason";

-- 5. Nurture is not lost. A date keeps somebody out of today's follow-up list
--    without pretending the opportunity is dead.
ALTER TABLE "Lead" ADD COLUMN "nurtureUntil" TIMESTAMP(3);

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_wonById_fkey"
  FOREIGN KEY ("wonById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Lead_strategyCallAt_idx" ON "Lead"("strategyCallAt");
CREATE INDEX "Lead_wonAt_idx" ON "Lead"("wonAt");
CREATE INDEX "Lead_proposalSentAt_idx" ON "Lead"("proposalSentAt");

-- 6. Backfilling what can be known honestly.
--
--    Last contact comes from the most recent logged call, which is the only
--    record of contact that exists today. Leads with no call log keep a null
--    and will correctly read as never contacted, because as far as this system
--    knows, they were not.
UPDATE "Lead" AS l
SET "lastContactAt" = c."latest"
FROM (
  SELECT "leadId", MAX("occurredAt") AS "latest"
  FROM "LeadCallLog"
  GROUP BY "leadId"
) AS c
WHERE l."id" = c."leadId";

--    A lead already sitting in the converted state was won at some point.
--    updatedAt is the closest honest approximation - the last write to a
--    converted lead is almost always the write that converted it - so it is
--    used, logged, and flagged rather than presented as fact. The closer is
--    left null: nobody knows who it was, and naming somebody would credit a
--    sale to a person who may not have made it.
INSERT INTO "MigrationLog" (
  "id", "migrationName", "entityType", "entityId", "fieldName",
  "previousValue", "mappedValue", "needsReview", "note"
)
SELECT
  gen_random_uuid()::text,
  '20260813000000_sales_next_action_and_outcomes',
  'Lead',
  "id",
  'wonAt',
  NULL,
  "updatedAt"::text,
  true,
  'Lead was already converted with no won date. Backfilled from updatedAt, which is an approximation. Closer left unknown.'
FROM "Lead"
WHERE "status" = 'CONVERTED' AND "deletedAt" IS NULL;

UPDATE "Lead"
SET "wonAt" = "updatedAt"
WHERE "status" = 'CONVERTED' AND "wonAt" IS NULL AND "deletedAt" IS NULL;

--    Same for lost leads, and the same restraint: the existing free-text reason
--    is not machine-classified into the new enum. Guessing that "no budget rn"
--    means NO_BUDGET is usually right and occasionally wrong, and a wrong code
--    is worse than an absent one because it silently skews the analytics.
UPDATE "Lead"
SET "lostAt" = "updatedAt"
WHERE "status" = 'LOST' AND "lostAt" IS NULL AND "deletedAt" IS NULL;
