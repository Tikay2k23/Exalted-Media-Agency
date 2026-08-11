-- ============================================================================
-- Richer task assignment: new fields, new categories, one status vocabulary.
--
-- Written by hand rather than generated, because both enums need their values
-- remapped and a generated migration would drop rows on the way. Every existing
-- task keeps its identity; only the words change.
-- ============================================================================

-- CreateEnum
CREATE TYPE "TaskPlatform" AS ENUM (
  'META_ADS', 'GOOGLE_ADS', 'GOHIGHLEVEL', 'WEBSITE', 'EMAIL', 'SMS',
  'FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'GOOGLE_BUSINESS_PROFILE', 'YOUTUBE',
  'TIKTOK', 'CANVA', 'ZAPIER', 'MAKE', 'N8N', 'OTHER'
);

-- CreateEnum
CREATE TYPE "TaskRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY');

-- AlterTable: the new detail the assignment form collects. All nullable, so
-- every task that already exists stays valid.
ALTER TABLE "EmployeeTask"
  ADD COLUMN "platform"       "TaskPlatform",
  ADD COLUMN "objective"      TEXT,
  ADD COLUMN "requiredAssets" TEXT,
  ADD COLUMN "kpi"            TEXT,
  ADD COLUMN "startDate"      TIMESTAMP(3),
  ADD COLUMN "recurrence"     "TaskRecurrence" NOT NULL DEFAULT 'NONE';

-- ============================================================================
-- Categories.
--
-- The eighteen marketing categories are added. The lifecycle ones - onboarding,
-- strategy, quality assurance, revision, launch and the rest - are kept exactly
-- as they are: five stage gates match on those names, and renaming them would
-- silently unblock every gated account in the system.
-- ============================================================================

CREATE TYPE "TaskCategory_new" AS ENUM (
  'CONTENT_PLANNING', 'COPYWRITING', 'CREATIVE_DESIGN', 'VIDEO_PRODUCTION',
  'PAID_MEDIA', 'SEO', 'SOCIAL_MEDIA', 'EMAIL_AND_SMS_MARKETING',
  'CRM_AND_AUTOMATION', 'FUNNELS_AND_LANDING_PAGES', 'WEBSITE_UPDATES',
  'LEAD_GENERATION_AND_OUTREACH', 'ANALYTICS_AND_TRACKING', 'CLIENT_REPORTING',
  'REPUTATION_MANAGEMENT', 'INTEGRATIONS', 'CLIENT_MANAGEMENT',
  'INTERNAL_OPERATIONS',
  'ONBOARDING', 'STRATEGY', 'QUALITY_ASSURANCE', 'REVISION', 'LAUNCH',
  'CLIENT_TRAINING', 'RENEWAL', 'OFFBOARDING', 'AUDIT'
);

-- Record what each task was, before the column can no longer say.
INSERT INTO "MigrationLog" ("id", "migrationName", "entityType", "entityId", "fieldName", "previousValue", "mappedValue", "needsReview", "note", "createdAt")
SELECT
  'mig_cat_' || "id",
  '20260811000000_task_assignment_detail',
  'EmployeeTask',
  "id",
  'category',
  "category"::text,
  CASE "category"::text
    WHEN 'CONTENT_CALENDAR'        THEN 'CONTENT_PLANNING'
    WHEN 'CREATIVE_PRODUCTION'     THEN 'CREATIVE_DESIGN'
    WHEN 'PAID_MEDIA_OPTIMIZATION' THEN 'PAID_MEDIA'
    WHEN 'SEO_AUDIT'               THEN 'SEO'
    WHEN 'EMAIL_CAMPAIGN'          THEN 'EMAIL_AND_SMS_MARKETING'
    WHEN 'COMMUNITY_MANAGEMENT'    THEN 'SOCIAL_MEDIA'
    WHEN 'WEBSITE_UPDATE'          THEN 'WEBSITE_UPDATES'
    WHEN 'ANALYTICS_REVIEW'        THEN 'ANALYTICS_AND_TRACKING'
    ELSE "category"::text
  END,
  FALSE,
  'Task category renamed. Lifecycle categories are unchanged because the stage gates match on them.',
  CURRENT_TIMESTAMP
FROM "EmployeeTask"
WHERE "category"::text IN (
  'CONTENT_CALENDAR', 'CREATIVE_PRODUCTION', 'PAID_MEDIA_OPTIMIZATION',
  'SEO_AUDIT', 'EMAIL_CAMPAIGN', 'COMMUNITY_MANAGEMENT', 'WEBSITE_UPDATE',
  'ANALYTICS_REVIEW'
);

ALTER TABLE "EmployeeTask" ALTER COLUMN "category" DROP DEFAULT;

ALTER TABLE "EmployeeTask"
  ALTER COLUMN "category" TYPE "TaskCategory_new"
  USING (
    CASE "category"::text
      WHEN 'CONTENT_CALENDAR'        THEN 'CONTENT_PLANNING'
      WHEN 'CREATIVE_PRODUCTION'     THEN 'CREATIVE_DESIGN'
      WHEN 'PAID_MEDIA_OPTIMIZATION' THEN 'PAID_MEDIA'
      WHEN 'SEO_AUDIT'               THEN 'SEO'
      WHEN 'EMAIL_CAMPAIGN'          THEN 'EMAIL_AND_SMS_MARKETING'
      WHEN 'COMMUNITY_MANAGEMENT'    THEN 'SOCIAL_MEDIA'
      WHEN 'WEBSITE_UPDATE'          THEN 'WEBSITE_UPDATES'
      WHEN 'ANALYTICS_REVIEW'        THEN 'ANALYTICS_AND_TRACKING'
      ELSE "category"::text
    END
  )::"TaskCategory_new";

DROP TYPE "TaskCategory";
ALTER TYPE "TaskCategory_new" RENAME TO "TaskCategory";
ALTER TABLE "EmployeeTask" ALTER COLUMN "category" SET DEFAULT 'INTERNAL_OPERATIONS';

-- ============================================================================
-- Statuses.
--
-- READY, WAITING_INTERNAL, IN_REVIEW, CHANGES_REQUIRED and READY_FOR_QA are
-- replaced. Each maps to the nearest survivor rather than being dropped:
--
--   READY            -> TODO              (ready to start is not started)
--   WAITING_INTERNAL -> BLOCKED           (waiting on us is blocked)
--   IN_REVIEW        -> NEEDS_REVIEW
--   READY_FOR_QA     -> NEEDS_REVIEW
--   CHANGES_REQUIRED -> REVISION_REQUIRED
--
-- CANCELLED survives. It is not a starting status, but work does get called off.
-- ============================================================================

CREATE TYPE "EmployeeTaskStatus_new" AS ENUM (
  'BACKLOG', 'TODO', 'IN_PROGRESS', 'WAITING_CLIENT', 'BLOCKED',
  'NEEDS_REVIEW', 'REVISION_REQUIRED', 'APPROVED', 'DONE', 'CANCELLED'
);

INSERT INTO "MigrationLog" ("id", "migrationName", "entityType", "entityId", "fieldName", "previousValue", "mappedValue", "needsReview", "note", "createdAt")
SELECT
  'mig_status_' || "id",
  '20260811000000_task_assignment_detail',
  'EmployeeTask',
  "id",
  'status',
  "status"::text,
  CASE "status"::text
    WHEN 'READY'            THEN 'TODO'
    WHEN 'WAITING_INTERNAL' THEN 'BLOCKED'
    WHEN 'IN_REVIEW'        THEN 'NEEDS_REVIEW'
    WHEN 'READY_FOR_QA'     THEN 'NEEDS_REVIEW'
    WHEN 'CHANGES_REQUIRED' THEN 'REVISION_REQUIRED'
    ELSE "status"::text
  END,
  -- Waiting-on-internal became blocked, which is a slightly blunter word for
  -- the same standstill. Worth a human glance.
  "status"::text = 'WAITING_INTERNAL',
  'Task status mapped to the single vocabulary used across the app.',
  CURRENT_TIMESTAMP
FROM "EmployeeTask"
WHERE "status"::text IN ('READY', 'WAITING_INTERNAL', 'IN_REVIEW', 'READY_FOR_QA', 'CHANGES_REQUIRED');

ALTER TABLE "EmployeeTask" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "EmployeeTask"
  ALTER COLUMN "status" TYPE "EmployeeTaskStatus_new"
  USING (
    CASE "status"::text
      WHEN 'READY'            THEN 'TODO'
      WHEN 'WAITING_INTERNAL' THEN 'BLOCKED'
      WHEN 'IN_REVIEW'        THEN 'NEEDS_REVIEW'
      WHEN 'READY_FOR_QA'     THEN 'NEEDS_REVIEW'
      WHEN 'CHANGES_REQUIRED' THEN 'REVISION_REQUIRED'
      ELSE "status"::text
    END
  )::"EmployeeTaskStatus_new";

DROP TYPE "EmployeeTaskStatus";
ALTER TYPE "EmployeeTaskStatus_new" RENAME TO "EmployeeTaskStatus";
ALTER TABLE "EmployeeTask" ALTER COLUMN "status" SET DEFAULT 'TODO';

-- CreateIndex
CREATE INDEX "EmployeeTask_category_idx" ON "EmployeeTask"("category");
CREATE INDEX "EmployeeTask_platform_idx" ON "EmployeeTask"("platform");
