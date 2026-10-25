-- Time a teacher spends on a card in review (plan 81, step 4): when the current holder
-- first claimed it, and on the verdict how long that took. Feeds the review-time norm.

ALTER TABLE "attempts" ADD COLUMN "review_started_at" TIMESTAMPTZ;
ALTER TABLE "attempts" ADD COLUMN "review_handling_seconds" INTEGER;
