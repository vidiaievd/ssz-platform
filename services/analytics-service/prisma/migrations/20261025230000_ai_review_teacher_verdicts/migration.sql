-- Teachers' verdicts on work a model had answered first, and how many went the other way
-- (plan 80, step 6c) — kept apart from `reviews`, the verdicts a model delivered.

ALTER TABLE "ai_draft_quality_daily" ADD COLUMN "teacher_verdicts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_draft_quality_daily" ADD COLUMN "teacher_overturned" INTEGER NOT NULL DEFAULT 0;
