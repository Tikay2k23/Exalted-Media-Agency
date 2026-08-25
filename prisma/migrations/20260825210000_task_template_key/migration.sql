-- AlterTable
ALTER TABLE "EmployeeTask" ADD COLUMN     "templateKey" TEXT;

-- CreateIndex
--
-- Unique per client rather than globally: two clients entering the same stage
-- both get that stage's work, and each may hold the key once. Existing rows are
-- all null, and Postgres does not treat nulls as equal, so nothing collides.
CREATE UNIQUE INDEX "EmployeeTask_clientId_templateKey_key" ON "EmployeeTask"("clientId", "templateKey");
