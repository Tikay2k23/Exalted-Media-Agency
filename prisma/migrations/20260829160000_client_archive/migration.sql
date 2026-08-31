-- Archiving a client files the engagement. It is not a delete: every related
-- record stays exactly where it is, and deletedAt continues to mean deleted.
ALTER TABLE "Client"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;

-- Active views filter on this, so it is worth an index.
CREATE INDEX "Client_archivedAt_idx" ON "Client"("archivedAt");

ALTER TABLE "Client" ADD CONSTRAINT "Client_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
