-- A model's draft review of a submission (plan 79, step 1.2).

CREATE TYPE "ai_draft_status" AS ENUM ('ready', 'failed', 'sent', 'edited', 'discarded');

CREATE TABLE "attempt_ai_drafts" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "status" "ai_draft_status" NOT NULL,
    "items" JSONB NOT NULL,
    "summary" TEXT,
    "error_code" TEXT,
    "provider_id" TEXT,
    "model_id" TEXT,
    "prompt_version" TEXT,
    "ai_call_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempt_ai_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attempt_ai_drafts_ai_call_id_key" ON "attempt_ai_drafts"("ai_call_id");
CREATE UNIQUE INDEX "attempt_ai_drafts_attempt_id_capability_key" ON "attempt_ai_drafts"("attempt_id", "capability");

ALTER TABLE "attempt_ai_drafts" ADD CONSTRAINT "attempt_ai_drafts_attempt_id_fkey"
    FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
