-- Whether a model answers a learner's work before the teacher does, and how long the
-- teacher has to look before the model's verdict counts (plan 80, step 1). Written by
-- hand, like the response settings: the dev database carries drift from older migrations.

CREATE TYPE "ReviewAiMode" AS ENUM ('teacher_only', 'ai_then_teacher', 'ai_with_sampling');

ALTER TABLE "schools"
  ADD COLUMN "review_ai_mode" "ReviewAiMode" NOT NULL DEFAULT 'teacher_only',
  ADD COLUMN "review_auto_accept_after_hours" INTEGER NOT NULL DEFAULT 168,
  ADD COLUMN "review_sample_percent" INTEGER NOT NULL DEFAULT 15;
