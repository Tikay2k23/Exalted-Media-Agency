-- Splitting the contact out of the opportunity.
--
-- A Lead has always been two things at once: the person, and the deal being
-- done with them. That was fine while every relationship had exactly one deal,
-- and wrong the moment an existing account came back for a second service -
-- the only way to record it was a duplicate contact, which then double-counted
-- the relationship in every source and rep report.
--
-- Contact takes over the identity. Lead keeps its own copies of the contact
-- columns and keeps being the row the whole application reads, so nothing
-- breaks on this migration: the new relation is additive and every column
-- added here is nullable. lib/sales/contact-service.ts is the single writer
-- that keeps the two in step from here on.

-- 1. The contact.
CREATE TABLE "Contact" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "email"        TEXT,
  "phone"        TEXT,
  -- Normalised match keys. Stored rather than computed per query because the
  -- duplicate check runs on every lead creation and every imported row, and a
  -- sequential scan with a function on each row does not survive an import.
  "emailKey"     TEXT,
  "phoneKey"     TEXT,
  "companyKey"   TEXT NOT NULL,
  "ownerId"      TEXT,
  "createdById"  TEXT,
  "notes"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "deletedAt"    TIMESTAMP(3),

  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Contact_emailKey_idx"   ON "Contact"("emailKey");
CREATE INDEX "Contact_phoneKey_idx"   ON "Contact"("phoneKey");
CREATE INDEX "Contact_companyKey_idx" ON "Contact"("companyKey");
CREATE INDEX "Contact_ownerId_idx"    ON "Contact"("ownerId");
CREATE INDEX "Contact_deletedAt_idx"  ON "Contact"("deletedAt");

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. What makes a Lead an opportunity rather than a person.
ALTER TABLE "Lead" ADD COLUMN "contactId"          TEXT;
ALTER TABLE "Lead" ADD COLUMN "opportunityName"    TEXT;
ALTER TABLE "Lead" ADD COLUMN "expectedCloseAt"    TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "createdById"        TEXT;
ALTER TABLE "Lead" ADD COLUMN "currentSolution"    TEXT;
ALTER TABLE "Lead" ADD COLUMN "qualificationNotes" TEXT;
ALTER TABLE "Lead" ADD COLUMN "campaign"           TEXT;
ALTER TABLE "Lead" ADD COLUMN "utmSource"          TEXT;
ALTER TABLE "Lead" ADD COLUMN "utmMedium"          TEXT;
ALTER TABLE "Lead" ADD COLUMN "utmCampaign"        TEXT;
ALTER TABLE "Lead" ADD COLUMN "referralSource"     TEXT;

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Lead_contactId_idx"       ON "Lead"("contactId");
CREATE INDEX "Lead_expectedCloseAt_idx" ON "Lead"("expectedCloseAt");

-- 3. Followers. Deliberately not a second owner column: an opportunity has one
--    owner who is answerable for it and any number of people watching.
CREATE TABLE "LeadFollower" (
  "id"        TEXT NOT NULL,
  "leadId"    TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "addedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeadFollower_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadFollower_leadId_userId_key" ON "LeadFollower"("leadId", "userId");
CREATE INDEX "LeadFollower_userId_idx" ON "LeadFollower"("userId");

ALTER TABLE "LeadFollower"
  ADD CONSTRAINT "LeadFollower_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadFollower"
  ADD CONSTRAINT "LeadFollower_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadFollower"
  ADD CONSTRAINT "LeadFollower_addedById_fkey"
  FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Backfill: one Contact per existing relationship.
--
-- Leads are grouped by the first identifier they actually have, in descending
-- order of confidence: email, then phone, then company plus contact name. Two
-- leads sharing an email are certainly the same person; two sharing only a
-- company name are probably the same account, which is why that rule is last
-- and why every row produced here is logged for review below.
--
-- The contact id is derived from the group key rather than generated, so this
-- statement produces the same ids if it is ever re-run and the UPDATE below can
-- recompute the mapping without a temporary table.

CREATE OR REPLACE FUNCTION pg_temp.lead_match_key(
  email TEXT, phone TEXT, business_name TEXT, contact_name TEXT
) RETURNS TEXT AS $$
  SELECT COALESCE(
    NULLIF(lower(btrim(email)), ''),
    NULLIF(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), ''),
    lower(btrim(business_name)) || '|' || lower(btrim(contact_name))
  );
$$ LANGUAGE SQL IMMUTABLE;

INSERT INTO "Contact" (
  "id", "name", "businessName", "email", "phone",
  "emailKey", "phoneKey", "companyKey", "ownerId", "createdAt", "updatedAt"
)
SELECT
  'ct_' || md5(g.match_key),
  g.name,
  g.business_name,
  g.email,
  g.phone,
  NULLIF(lower(btrim(g.email)), ''),
  NULLIF(regexp_replace(COALESCE(g.phone, ''), '[^0-9]', '', 'g'), ''),
  lower(btrim(g.business_name)),
  g.owner_id,
  g.created_at,
  CURRENT_TIMESTAMP
FROM (
  SELECT
    pg_temp.lead_match_key("email", "phone", "businessName", "contactName") AS match_key,
    -- The earliest row supplies the display identity; the earliest row that
    -- actually has one supplies each contact detail, so a contact does not end
    -- up missing a phone number that one of its opportunities carried.
    (array_agg("contactName"  ORDER BY "createdAt", "id"))[1] AS name,
    (array_agg("businessName" ORDER BY "createdAt", "id"))[1] AS business_name,
    (array_agg("email"        ORDER BY ("email" IS NULL),        "createdAt", "id"))[1] AS email,
    (array_agg("phone"        ORDER BY ("phone" IS NULL),        "createdAt", "id"))[1] AS phone,
    (array_agg("assignedToId" ORDER BY ("assignedToId" IS NULL), "createdAt", "id"))[1] AS owner_id,
    min("createdAt") AS created_at
  FROM "Lead"
  GROUP BY 1
) AS g
ON CONFLICT ("id") DO NOTHING;

UPDATE "Lead"
SET "contactId" = 'ct_' || md5(
  pg_temp.lead_match_key("email", "phone", "businessName", "contactName")
)
WHERE "contactId" IS NULL;

-- 5. Flag every group that was formed on the weakest rule. Anything matched on
--    company plus contact name alone is a guess, and somebody should confirm
--    it before two real accounts stay merged.
INSERT INTO "MigrationLog" (
  "id", "migrationName", "entityType", "entityId",
  "fieldName", "previousValue", "mappedValue", "needsReview", "note", "createdAt"
)
SELECT
  'ml_' || md5('20260814000000_contacts_and_opportunities|' || l."id"),
  '20260814000000_contacts_and_opportunities',
  'LEAD',
  l."id",
  'contactId',
  NULL,
  l."contactId",
  TRUE,
  'Grouped onto a contact by company and contact name because the lead has no email or phone. Confirm this is the same account.',
  CURRENT_TIMESTAMP
FROM "Lead" l
WHERE NULLIF(btrim(COALESCE(l."email", '')), '') IS NULL
  AND NULLIF(regexp_replace(COALESCE(l."phone", ''), '[^0-9]', '', 'g'), '') IS NULL
ON CONFLICT ("id") DO NOTHING;
