-- Whether a school's learners may have a model check their work before they hand it in, and
-- the school's limits on it (plan 84, step 4). A new school starts with it off; every school
-- that exists today starts with it on, 3 checks per exercise and no monthly limit of its own:
-- whether the school pays at all is the plan's `ai.practice`, checked when a check is asked
-- for, not this. Written by hand, like the review policy: the dev database carries drift from
-- older migrations.

ALTER TABLE "schools"
  ADD COLUMN "ai_precheck_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ai_precheck_per_exercise_limit" INTEGER DEFAULT 3,
  ADD COLUMN "ai_precheck_per_learner_monthly_credits" INTEGER;

UPDATE "schools" SET "ai_precheck_enabled" = true;
