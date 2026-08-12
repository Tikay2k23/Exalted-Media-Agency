-- Internal notes on a lead.
--
-- Lead.notes stays exactly where it is. It holds the qualification detail
-- captured when the lead was created, and nothing here touches it - but it is
-- one text field with no author and no timestamp, so it cannot answer "who
-- said this, and when". This table is the running conversation, shaped like
-- TaskComment because it is the same idea applied to a lead.
CREATE TABLE "LeadNote" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadNote_leadId_createdAt_idx" ON "LeadNote"("leadId", "createdAt");
CREATE INDEX "LeadNote_authorId_idx" ON "LeadNote"("authorId");

ALTER TABLE "LeadNote"
  ADD CONSTRAINT "LeadNote_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeadNote"
  ADD CONSTRAINT "LeadNote_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
