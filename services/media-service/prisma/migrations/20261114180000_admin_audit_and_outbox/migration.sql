-- Plan 90, phase 8, step 4: the admin trail of media-service and the outbox that carries it.
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

CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "routing_key" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "correlation_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbox_event_id_key" ON "outbox"("event_id");
CREATE INDEX "outbox_published_at_created_at_idx" ON "outbox"("published_at", "created_at");
