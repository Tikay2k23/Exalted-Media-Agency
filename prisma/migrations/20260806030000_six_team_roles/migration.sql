-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('AGENCY_OWNER', 'SALES_REP', 'PROJECT_MANAGER', 'AUTOMATION_SPECIALIST', 'CREATIVE_SPECIALIST', 'ADS_SPECIALIST');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "teamRole" "TeamRole" NOT NULL DEFAULT 'CREATIVE_SPECIALIST';

-- CreateIndex
CREATE INDEX "User_teamRole_idx" ON "User"("teamRole");

-- ============================================================================
-- Collapse 26 job positions onto the six seats the agency actually has.
--
-- Nothing is lost: `position` is retained as a descriptive job title, and every
-- mapping is written to "MigrationLog". Seats that absorb several positions are
-- flagged for review so a human can confirm the access is right.
-- ============================================================================

UPDATE "User" SET "teamRole" = 'AGENCY_OWNER'
WHERE "position" IN ('AGENCY_OWNER', 'AGENCY_DIRECTOR', 'FINANCE_ADMINISTRATOR', 'SECURITY_ADMINISTRATOR')
   OR "role" IN ('OWNER', 'ADMIN');

UPDATE "User" SET "teamRole" = 'SALES_REP'
WHERE "position" IN ('SALES_MANAGER', 'SALES_REPRESENTATIVE') AND "role" NOT IN ('OWNER', 'ADMIN');

UPDATE "User" SET "teamRole" = 'PROJECT_MANAGER'
WHERE "position" IN (
  'OPERATIONS_MANAGER', 'PROJECT_MANAGER', 'CLIENT_SUCCESS_MANAGER',
  'ACCOUNT_MANAGER', 'CLIENT_TRAINER', 'HR_TRAINING_MANAGER', 'QA_REVIEWER'
) AND "role" NOT IN ('OWNER', 'ADMIN');

UPDATE "User" SET "teamRole" = 'AUTOMATION_SPECIALIST'
WHERE "position" IN ('GOHIGHLEVEL_SPECIALIST', 'CRM_AUTOMATION_SPECIALIST', 'INTEGRATION_SPECIALIST')
  AND "role" NOT IN ('OWNER', 'ADMIN');

UPDATE "User" SET "teamRole" = 'CREATIVE_SPECIALIST'
WHERE "position" IN (
  'FUNNEL_WEBSITE_BUILDER', 'COPYWRITER', 'GRAPHIC_DESIGNER',
  'VIDEO_EDITOR', 'CONTENT_SPECIALIST', 'SOCIAL_MEDIA_MANAGER'
) AND "role" NOT IN ('OWNER', 'ADMIN');

UPDATE "User" SET "teamRole" = 'ADS_SPECIALIST'
WHERE "position" IN (
  'META_ADS_SPECIALIST', 'GOOGLE_ADS_SPECIALIST', 'SEO_SPECIALIST',
  'TRACKING_ANALYTICS_SPECIALIST'
) AND "role" NOT IN ('OWNER', 'ADMIN');

INSERT INTO "MigrationLog" ("id", "migrationName", "entityType", "entityId", "fieldName", "previousValue", "mappedValue", "needsReview", "note", "createdAt")
SELECT
  'mig_seat_' || "id",
  '20260806030000_six_team_roles',
  'User',
  "id",
  'teamRole',
  "position"::text,
  "teamRole"::text,
  -- A QA reviewer or a finance administrator now sits inside a broader seat.
  -- Those absorptions widen access, so they are flagged.
  "position" IN ('QA_REVIEWER', 'FINANCE_ADMINISTRATOR', 'SECURITY_ADMINISTRATOR', 'HR_TRAINING_MANAGER', 'UNASSIGNED'),
  'Job title "' || "position"::text || '" now sits in the ' || "teamRole"::text || ' seat. '
    || 'The title is kept for reference; access comes from the seat.',
  CURRENT_TIMESTAMP
FROM "User";
