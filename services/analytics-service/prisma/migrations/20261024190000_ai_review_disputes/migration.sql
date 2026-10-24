-- Learners' "this review is wrong" on models' reviews, beside the verdicts delivered (plan 79, step 2.3b).

ALTER TABLE "ai_draft_quality_daily" ADD COLUMN "disputes" INTEGER NOT NULL DEFAULT 0;
