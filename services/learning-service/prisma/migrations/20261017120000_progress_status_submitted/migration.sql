-- ─── ProgressStatus gains SUBMITTED (plan 76, 2.6) ───────────────────────────
-- Work handed to a teacher and not judged yet. Until now it was written as `in_progress`
-- by the engine's event and overwritten to `completed` by the clients, so a returned
-- piece of work showed «Done» until it was approved.
--
-- Existing rows are not touched here: they are recomputed from the engine's attempts by a
-- separate script, dry-run first, because the attempts live in another database.
--
-- NOTE: the enum's DB-side value is the @map value, not the Prisma member name.

ALTER TYPE "progress_status" ADD VALUE IF NOT EXISTS 'submitted';
