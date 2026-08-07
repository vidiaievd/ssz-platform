-- ─── SrsContentType gains EXERCISE_GAP (plan 36 §C.1) ─────────────────────────
-- A review card may now point at one gap inside an exercise rather than the whole
-- of it, so that one wrong sentence in a block of six no longer brings all six back.
-- contentId for these is "<exerciseId>#<gapKey>".
--
-- Additive only: existing cards keep contentType 'exercise' and their schedule.
-- Nothing is migrated — learners already have review history, and recomputing
-- intervals after the fact would break a schedule people are living by.
--
-- NOTE: the enum's DB-side value is the @map value, not the Prisma member name.

ALTER TYPE "srs_content_type" ADD VALUE IF NOT EXISTS 'exercise_gap';
