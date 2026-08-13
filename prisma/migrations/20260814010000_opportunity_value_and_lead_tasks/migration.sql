-- Three additions, all nullable, none replacing anything.

-- 1. What the deal is worth, separate from what the prospect said they could
--    spend. Rolling the two together made the forecast a record of other
--    people's opinions: "budget under $2,500" is a qualification answer, "this
--    is a $4,000 engagement" is the agency's own number, and Pipeline Value
--    should be built from the second.
ALTER TABLE "Lead" ADD COLUMN "opportunityValue" DECIMAL(12,2);

-- 2. The budget band, kept as it was answered. budgetAmount stays for the times
--    somebody actually knows the figure; this is for the times they only know
--    the range, which is most of them.
ALTER TABLE "Lead" ADD COLUMN "budgetRange" TEXT;

-- 3. Tasks against an open opportunity.
--
--    EmployeeTask already has a nullable clientId, so a task that belongs to
--    nobody's client account is an existing, supported state. Pointing it at a
--    lead instead is the smallest change that makes "Add task" on an
--    opportunity real - the alternative was a second task table that no
--    workload report, no EOD entry and no approval flow would ever have seen.
ALTER TABLE "EmployeeTask" ADD COLUMN "leadId" TEXT;

ALTER TABLE "EmployeeTask"
  ADD CONSTRAINT "EmployeeTask_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "EmployeeTask_leadId_idx" ON "EmployeeTask"("leadId");
