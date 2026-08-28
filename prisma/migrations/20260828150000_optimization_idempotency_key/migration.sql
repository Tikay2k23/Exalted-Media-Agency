-- One submission of the log form, enforced by the database rather than by a
-- read-then-write check that two simultaneous requests can both pass.
ALTER TABLE "Optimization" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Optimization_idempotencyKey_key" ON "Optimization"("idempotencyKey");
