-- Rubric grading for `writing_task` (plan 50 §3.2).
--
-- `rubric_marks` is what a teacher set, one mark 0-3 per criterion; `rubric_snapshot`
-- is the rubric those marks were set against, frozen when the submission reached the
-- queue. Both nullable and defaultless: every other template grades per item and has
-- neither, and an attempt queued before this migration has no snapshot — which is a
-- fact the verdict reads, not a gap it fills in.
ALTER TABLE "attempts" ADD COLUMN "rubric_marks" JSONB;
ALTER TABLE "attempts" ADD COLUMN "rubric_snapshot" JSONB;
