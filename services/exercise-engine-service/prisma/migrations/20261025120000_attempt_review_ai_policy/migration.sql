-- The school's review policy as it stood at hand-in (plan 80, step 3a): set only where a
-- model may answer the school's work first. Null everywhere else — a teacher reviews it.

ALTER TABLE "attempts"
  ADD COLUMN "review_ai_mode" TEXT,
  ADD COLUMN "review_auto_accept_at" TIMESTAMPTZ,
  ADD COLUMN "review_teacher_drawn" BOOLEAN;
