-- AlterTable
ALTER TABLE "PipelineStage" ADD COLUMN     "isDeprecated" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- Retire the six pre-SOP delivery stages.
--
-- They are NOT deleted: an account may still be sitting on one, and stage
-- history references them. Instead they are moved out of positions 1-18 so the
-- canonical SOP journey stages can occupy those slots, and flagged as
-- deprecated so no new account can be moved into them.
-- ============================================================================

UPDATE "PipelineStage"
SET "position" = "position" + 900,
    "isDeprecated" = true,
    "description" = COALESCE("description", '')
      || 'Retired stage from before the SOP rollout. Kept so existing accounts and '
      || 'stage history stay valid. Move any account here onto a current journey stage.'
WHERE "slug" IN ('new-client', 'onboarding', 'in-progress', 'waiting-on-client', 'review', 'completed')
  AND "isDeprecated" = false;

INSERT INTO "MigrationLog" ("id", "migrationName", "entityType", "entityId", "fieldName", "previousValue", "mappedValue", "needsReview", "note", "createdAt")
SELECT
  'mig_retire_' || "id",
  '20260806010000_retire_legacy_stages',
  'PipelineStage',
  "id",
  'position',
  ("position" - 900)::text,
  "position"::text,
  EXISTS (SELECT 1 FROM "Client" c WHERE c."currentStageId" = "PipelineStage"."id"),
  'Stage "' || "name" || '" was retired. '
    || CASE
         WHEN EXISTS (SELECT 1 FROM "Client" c WHERE c."currentStageId" = "PipelineStage"."id")
           THEN 'Accounts are still on this stage and must be moved to a current journey stage.'
         ELSE 'No accounts were on this stage.'
       END,
  CURRENT_TIMESTAMP
FROM "PipelineStage"
WHERE "isDeprecated" = true;
