-- A learner disputes a model's review of their work (plan 79, step 2.3b).

ALTER TABLE "attempt_ai_drafts" ADD COLUMN "disputed_at" TIMESTAMPTZ;
ALTER TABLE "attempt_ai_drafts" ADD COLUMN "dispute_reason" TEXT;
