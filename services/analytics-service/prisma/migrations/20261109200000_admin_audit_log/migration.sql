-- What platform admins changed, across services (plan 90, phase 1, step 6).

CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "actor_id" TEXT,
    "actor_level" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT,
    "before" JSONB,
    "after" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_log_occurred_at_id_idx" ON "admin_audit_log" ("occurred_at" DESC, "id" DESC);
CREATE INDEX "admin_audit_log_target_type_target_id_occurred_at_idx" ON "admin_audit_log" ("target_type", "target_id", "occurred_at" DESC);
CREATE INDEX "admin_audit_log_actor_id_occurred_at_idx" ON "admin_audit_log" ("actor_id", "occurred_at" DESC);
CREATE INDEX "admin_audit_log_service_occurred_at_idx" ON "admin_audit_log" ("service", "occurred_at" DESC);
