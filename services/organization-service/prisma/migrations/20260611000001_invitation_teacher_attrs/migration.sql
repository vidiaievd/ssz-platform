-- Add teacher workload/employment attributes to school_invitations so they can be
-- set at invite-time and materialized into school_teachers on accept (§5.7).

-- Create enum type if not already present (was missing from earlier migrations)
DO $$ BEGIN
  CREATE TYPE "employment_type" AS ENUM ('full', 'part', 'contract');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "school_invitations"
  ADD COLUMN IF NOT EXISTS "teacher_max_weekly_hours" INTEGER,
  ADD COLUMN IF NOT EXISTS "teacher_employment_type"  "employment_type";
