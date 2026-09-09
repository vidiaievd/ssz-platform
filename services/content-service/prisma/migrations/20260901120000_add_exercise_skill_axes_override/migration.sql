-- The author's word on what an exercise trains (plan 55 §3.5).
--
-- Everything about the skill and focus axes is derived — from the template, from where
-- the exercise stands in its lesson, from flags inside the document — so 452 seeded
-- exercises carry axes without anyone tagging them. These columns are the escape hatch
-- for the cases the derivation gets wrong.
--
-- `override_set_at` is the marker, and it exists because Postgres arrays through Prisma
-- are never null: without it, "the author has said nothing yet" and "the author says
-- this exercise counts towards nothing" would be the same empty array. Null here means
-- the derivation is in charge and the two arrays below are ignored entirely.
--
-- Not kept inside `content`: that would mean editing the `content_schema` of all
-- thirteen templates, and those schemas live in the database — the change would read
-- fine and refuse every write until the seed was run again.

-- AlterTable
ALTER TABLE "exercises"
  ADD COLUMN "skills_override" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "focus_override" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "override_set_at" TIMESTAMPTZ;
