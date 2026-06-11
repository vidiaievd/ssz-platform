-- Add teacher workload/employment attributes to school_invitations so they can be
-- set at invite-time and materialized into school_teachers on accept (§5.7).

ALTER TABLE "school_invitations"
  ADD COLUMN IF NOT EXISTS "teacher_max_weekly_hours" INTEGER,
  ADD COLUMN IF NOT EXISTS "teacher_employment_type"  "employment_type";
