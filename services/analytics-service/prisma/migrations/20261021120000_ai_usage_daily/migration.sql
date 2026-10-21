-- ─── AI usage rollup (plan 77, step 10) ──────────────────────────────────────
-- One row per day × capability × model × payer × outcome, fed by `ai.call.completed`.
-- Latency lives in fixed buckets so percentiles survive any regrouping on read.

CREATE TABLE "ai_usage_daily" (
  "id"                 TEXT          NOT NULL,
  "day"                DATE          NOT NULL,
  "capability"         TEXT          NOT NULL,
  "provider_code"      TEXT,
  "provider_model_id"  TEXT,
  "payer_type"         TEXT          NOT NULL,
  "payer_id"           TEXT          NOT NULL,
  "outcome"            TEXT          NOT NULL,
  "calls"              INTEGER       NOT NULL,
  "fallback_calls"     INTEGER       NOT NULL,
  "unpriced_calls"     INTEGER       NOT NULL,
  "input_tokens"       BIGINT        NOT NULL,
  "output_tokens"      BIGINT        NOT NULL,
  "cache_read_tokens"  BIGINT        NOT NULL,
  "cache_write_tokens" BIGINT        NOT NULL,
  "credits"            DECIMAL(18,6) NOT NULL,
  "latency_sum_ms"     BIGINT        NOT NULL,
  "latency_min_ms"     INTEGER       NOT NULL,
  "latency_max_ms"     INTEGER       NOT NULL,
  "latency_buckets"    INTEGER[]     NOT NULL,
  "updated_at"         TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "ai_usage_daily_pkey" PRIMARY KEY ("id")
);

-- NULLS NOT DISTINCT: calls no model answered carry null provider and model, and must
-- still meet on one row. Without it every refusal would insert a row of its own.
CREATE UNIQUE INDEX "ai_usage_daily_dims_key"
  ON "ai_usage_daily" ("day", "capability", "provider_code", "provider_model_id", "payer_type", "payer_id", "outcome")
  NULLS NOT DISTINCT;

CREATE INDEX "ai_usage_daily_day_idx" ON "ai_usage_daily" ("day");
CREATE INDEX "ai_usage_daily_payer_type_payer_id_day_idx" ON "ai_usage_daily" ("payer_type", "payer_id", "day");
