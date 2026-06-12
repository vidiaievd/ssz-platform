-- Add teacher_languages JSONB column to school_invitations.
-- Stores [{ code, level }] array set at invite-time for role=TEACHER.
-- Materialized into teaching_profile.languages on accept (§C of role-separation spec).

ALTER TABLE "school_invitations"
  ADD COLUMN IF NOT EXISTS "teacher_languages" JSONB;
