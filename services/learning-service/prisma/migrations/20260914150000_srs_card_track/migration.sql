-- ─── A review card belongs to a track (plan 63 phase 6) ──────────────────────
-- The daily budgets split in two: "fifteen words and five rules today" is a teaching
-- decision, "twenty cards today" is not. The track is a property of the atom, kept on
-- the card so the due queue can be asked about one track without a call per card into
-- content-service.
--
-- Backfill: everything a learner is served today is lexical — words, and the
-- exercise-scoped cards that predate atoms and retire in phase 7. The shadow grammar
-- atom cards written since phase 5 are grammar unless their atom says LEXIS, which
-- this migration cannot know; they are corrected on the next attempt that rates them,
-- and nothing reads them yet.
--
-- NOTE: enum values are the @map values, not the Prisma member names.

CREATE TYPE "srs_track" AS ENUM ('lexis', 'grammar');

ALTER TABLE "srs_review_cards"
  ADD COLUMN "track" "srs_track" NOT NULL DEFAULT 'lexis';

UPDATE "srs_review_cards"
   SET "track" = 'grammar'
 WHERE "content_type" = 'grammar_atom';

CREATE INDEX "srs_review_cards_user_id_track_due_at_state_idx"
  ON "srs_review_cards" ("user_id", "track", "due_at", "state");
