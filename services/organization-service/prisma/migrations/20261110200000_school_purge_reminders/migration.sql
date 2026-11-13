-- Plan 90, phase 5, step 2: the owner is reminded 30 and 7 days before a closed school is purged, once each.
ALTER TABLE "schools"
  ADD COLUMN "purge_reminded_30_at" TIMESTAMP(3),
  ADD COLUMN "purge_reminded_7_at" TIMESTAMP(3);

-- The lifecycle timer looks for closing and purging schools by these.
CREATE INDEX "schools_closes_at_idx" ON "schools"("closes_at") WHERE "status" = 'suspended';
CREATE INDEX "schools_purge_at_idx" ON "schools"("purge_at") WHERE "status" = 'closed';
