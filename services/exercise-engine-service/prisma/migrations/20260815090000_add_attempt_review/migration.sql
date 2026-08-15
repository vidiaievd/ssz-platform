-- Teacher review of free-form attempts (plan 42, phase 8).
-- Free-form attempts stop at routed_for_review; the verdict that follows is a person's.

ALTER TYPE "attempt_status" ADD VALUE IF NOT EXISTS 'returned';

ALTER TABLE "attempts"
  ADD COLUMN "reviewed_by_user_id" TEXT,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ,
  ADD COLUMN "review_comment" TEXT,
  ADD COLUMN "review_decisions" JSONB;

-- The review queue reads "everything waiting on one exercise".
CREATE INDEX "attempts_exercise_id_status_idx" ON "attempts"("exercise_id", "status");
