-- Plan 90, phase 1, step 5: the admin trail of subscription-service.
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
