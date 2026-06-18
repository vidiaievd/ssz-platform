-- Add employment_type and status to school_teachers.
-- employment_type enum already exists (created in invitation_teacher_attrs migration).
-- teacher_status enum is new.

DO $$ BEGIN
  CREATE TYPE "teacher_status" AS ENUM ('active', 'invited', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "school_teachers"
  ADD COLUMN IF NOT EXISTS "employment_type" "employment_type",
  ADD COLUMN IF NOT EXISTS "status"          "teacher_status" NOT NULL DEFAULT 'active';
