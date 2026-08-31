-- Which release a test gates. Defaults to beta-required, so a case added
-- without thinking about it counts against the nearest release rather than
-- silently against none.
CREATE TYPE "UatReleaseScope" AS ENUM ('LIMITED_BETA_REQUIRED', 'PRODUCTION_REQUIRED', 'FUTURE_OUT_OF_SCOPE');

ALTER TABLE "UatTestCase"
  ADD COLUMN "releaseScope" "UatReleaseScope" NOT NULL DEFAULT 'LIMITED_BETA_REQUIRED',
  ADD COLUMN "scopeReason" TEXT;

CREATE INDEX "UatTestCase_releaseScope_idx" ON "UatTestCase"("releaseScope");
