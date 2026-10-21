-- CreateEnum
CREATE TYPE "ai_payer_type" AS ENUM ('workspace', 'user', 'platform');

-- CreateEnum
CREATE TYPE "ai_call_outcome" AS ENUM ('ok', 'invalid_response', 'error', 'refused_quota', 'refused_policy', 'disabled');

-- CreateTable
CREATE TABLE "ai_calls" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "payer_type" "ai_payer_type" NOT NULL,
    "payer_id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_role" TEXT,
    "surface" TEXT NOT NULL,
    "provider_id" TEXT,
    "model_id" TEXT,
    "prompt_version" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cache_read_tokens" INTEGER,
    "cache_write_tokens" INTEGER,
    "cost_micros" BIGINT,
    "currency" TEXT,
    "credits" DECIMAL(18,6),
    "latency_ms" INTEGER NOT NULL,
    "outcome" "ai_call_outcome" NOT NULL,
    "error_code" TEXT,
    "fallback_used" BOOLEAN NOT NULL,
    "attempts" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateIndex
CREATE INDEX "ai_calls_created_at_idx" ON "ai_calls"("created_at");

-- CreateIndex
CREATE INDEX "ai_calls_payer_type_payer_id_capability_created_at_idx" ON "ai_calls"("payer_type", "payer_id", "capability", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_event_id_key" ON "outbox"("event_id");

-- CreateIndex
CREATE INDEX "outbox_published_at_created_at_idx" ON "outbox"("published_at", "created_at");

