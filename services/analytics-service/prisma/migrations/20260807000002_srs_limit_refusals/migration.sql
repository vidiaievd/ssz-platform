-- ─── Projection: SrsLimitRefusal (plan 37 §A.1) ───────────────────────────────
-- One row per time a daily SRS cap turned something down. The counterpart to
-- attempt_evidence, which by construction only holds attempts that got through.

CREATE TABLE "srs_limit_refusals" (
    "id"           TEXT NOT NULL,
    "event_id"     TEXT NOT NULL,
    "user_id"      TEXT NOT NULL,
    "kind"         TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "occurred_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "srs_limit_refusals_pkey" PRIMARY KEY ("id")
);

-- One row per event: the consumer is at-least-once, and a redelivery must not
-- inflate the very count the table exists to measure.
CREATE UNIQUE INDEX "srs_limit_refusals_event_id_key"
    ON "srs_limit_refusals"("event_id");

CREATE INDEX "srs_limit_refusals_kind_occurred_at_idx"
    ON "srs_limit_refusals"("kind", "occurred_at");

CREATE INDEX "srs_limit_refusals_user_id_occurred_at_idx"
    ON "srs_limit_refusals"("user_id", "occurred_at");
