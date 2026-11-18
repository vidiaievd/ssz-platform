-- Plan 90, phase 5, step 1: a school's stored lifecycle status and the organization admin trail.

CREATE TYPE "school_status" AS ENUM ('active', 'suspended', 'closed', 'purged');

ALTER TABLE "schools"
  ADD COLUMN "status" "school_status" NOT NULL DEFAULT 'active',
  ADD COLUMN "status_changed_at" TIMESTAMP(3),
  ADD COLUMN "closes_at" TIMESTAMP(3),
  ADD COLUMN "purge_at" TIMESTAMP(3),
  ADD COLUMN "status_reason" VARCHAR(500);

-- A school its owner deleted is archived: closed since it was deleted, purged six months later
-- (183 days, as SCHOOL_ARCHIVE_DAYS).
UPDATE "schools"
   SET "status" = 'closed',
       "status_changed_at" = "deletedAt",
       "purge_at" = "deletedAt" + INTERVAL '183 days',
       "isActive" = false
 WHERE "deletedAt" IS NOT NULL;

-- Nothing ever switched a school off without deleting it; a row that says so anyway stays active
-- and is made to agree (isActive mirrors status from now on).
UPDATE "schools" SET "isActive" = true WHERE "deletedAt" IS NULL AND "isActive" = false;

CREATE INDEX "schools_status_idx" ON "schools"("status");

CREATE TABLE "admin_audit" (
    "id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_level" VARCHAR(16) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(64) NOT NULL,
    "target_id" VARCHAR(128) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "before" JSONB,
    "after" JSONB,

    CONSTRAINT "admin_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_occurred_at_idx" ON "admin_audit"("occurred_at");

CREATE INDEX "admin_audit_target_idx" ON "admin_audit"("target_type", "target_id");
