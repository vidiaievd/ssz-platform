-- Suggested rubric marks against the teacher's, beside the remarks (plan 79, step 1.7d).
-- Existing rows predate marks: zero is what they carried.

ALTER TABLE "ai_draft_quality_daily"
  ADD COLUMN "reviews_with_marks"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "marks_same"          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "marks_different"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "marks_compared"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "marks_delta_sum"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "marks_abs_delta_sum" INTEGER NOT NULL DEFAULT 0;
