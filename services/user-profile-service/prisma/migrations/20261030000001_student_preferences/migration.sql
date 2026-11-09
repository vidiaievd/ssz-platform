-- Account-level learning preferences of a student (VoxOrd plan 07, step 8).
-- NULL means the learner has not chosen; the app applies its own default.
ALTER TABLE "student_profiles"
  ADD COLUMN "daily_goal_min"       INTEGER,
  ADD COLUMN "translation_language" TEXT;
