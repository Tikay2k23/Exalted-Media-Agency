-- Custom tags on an opportunity.
--
-- The automatic stage tag is deliberately not stored here. It is derived from
-- the stage, so it cannot disagree with where the deal actually is - and
-- keeping it out of this column is what makes "a stage move removes only the
-- old stage tag" true by construction rather than by careful code.
--
-- Defaults to an empty array, so every existing lead reads as untagged rather
-- than null, and the application never has to check for both.
ALTER TABLE "Lead" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
