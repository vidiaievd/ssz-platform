-- Lessons can now be marked as actually held. Existing rows keep their status:
-- a past 'scheduled' lesson is not retroactively assumed to have happened,
-- because nobody said it did.
ALTER TYPE "lesson_status" ADD VALUE 'held';
