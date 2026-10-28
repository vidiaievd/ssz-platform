-- Which of its students a school's assistant answers on the school's account (plan 83,
-- Q6). Every school, existing and new, starts with all its students: whether the school
-- pays at all is the plan's `ai.student_assist`, not this. Written by hand, like the
-- review policy: the dev database carries drift from older migrations.

CREATE TYPE "AssistantMode" AS ENUM ('off', 'all_students', 'selected_groups', 'selected_students');

ALTER TABLE "schools"
  ADD COLUMN "assistant_mode" "AssistantMode" NOT NULL DEFAULT 'all_students',
  ADD COLUMN "assistant_group_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "assistant_student_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
