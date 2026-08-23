-- Answers handed in one question at a time, for `short_answer` (plan 51 §3.3).
--
-- Nullable and defaultless, like the draft columns above it: an attempt that predates
-- this, or one whose template hands everything in at once, has no per-question answers,
-- and that is a different thing from an empty list.
--
-- Append-only by the domain, not by the database: the entity refuses a second answer to
-- a question it already holds. A constraint here could not express that without knowing
-- the shape, and the shape is deliberately the template's business.
ALTER TABLE "attempts" ADD COLUMN "answered_questions" JSONB;
