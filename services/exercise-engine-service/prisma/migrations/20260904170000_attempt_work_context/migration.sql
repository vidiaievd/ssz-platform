-- Where a piece of work was done: in class, as homework, or on the learner's own
-- time. Nullable and not backfilled — an attempt from before the field existed did
-- not say, and guessing 'self_study' for it would put made-up rows in the analytics
-- that this column exists to feed.
ALTER TABLE "attempts" ADD COLUMN "work_context" TEXT;
ALTER TABLE "attempts" ADD COLUMN "lesson_id" TEXT;
