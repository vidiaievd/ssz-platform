-- The work-in-progress answer, autosaved while an attempt is open.
--
-- Nullable and defaultless on purpose: an attempt that predates this, or one whose
-- runner never autosaves, has no draft, and that is a different thing from an empty
-- one. Both columns are written together, so `draft_saved_at IS NULL` means "never
-- saved" and never "saved at an unknown time".
ALTER TABLE "attempts" ADD COLUMN "draft_answer" JSONB;
ALTER TABLE "attempts" ADD COLUMN "draft_saved_at" TIMESTAMPTZ;
