-- A course's part of the school's review policy (plan 80, step 2): its own auto-accept
-- term (null inherits the school's) and the exercise types that always go to a teacher
-- when the school samples the model's verdicts.

ALTER TABLE "containers"
  ADD COLUMN "review_auto_accept_after_hours" INTEGER,
  ADD COLUMN "review_teacher_templates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
