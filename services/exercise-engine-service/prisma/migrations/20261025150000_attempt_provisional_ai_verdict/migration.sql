-- A model's verdict on a school's work that does not count yet (plan 80, step 3b): the
-- learner reads it while the teacher's is awaited. Null everywhere else.

ALTER TABLE "attempts" ADD COLUMN "review_ai_verdict" JSONB;
