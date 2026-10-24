-- What a teacher's verdict made of a model's draft, remark by remark (plan 79, step 1.5).

ALTER TABLE "attempt_ai_drafts" ADD COLUMN "outcomes" JSONB;
ALTER TABLE "attempt_ai_drafts" ADD COLUMN "decided_at" TIMESTAMP(3);
