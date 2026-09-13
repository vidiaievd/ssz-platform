-- What one piece of an exercise is about — plan 63, phase 1.
--
-- The level that was missing: an exercise knows which rule it belongs to, a learner's card
-- knows which exercise it came from, and nothing said which *word* or which *part of a rule*
-- the third gap was testing. A teacher could see a failing exercise but not a failing fact,
-- and a generator had nothing to generate about.
--
-- Beside the exercise rather than inside its document, for the reason the skill-axes override
-- columns were: thirteen content_schemas live in this database, each with its own shape of
-- item, and a change to them reads fine and refuses every write until the seed is re-run.

-- CreateEnum
CREATE TYPE "atom_type" AS ENUM ('vocabulary_item', 'grammar_rule_atom');
CREATE TYPE "target_role" AS ENUM ('focus', 'context');

-- CreateTable
CREATE TABLE "exercise_item_targets" (
    "id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "item_key" VARCHAR(120),
    "atom_type" "atom_type" NOT NULL,
    "atom_id" UUID NOT NULL,
    "role" "target_role" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "exercise_item_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercise_item_targets_exercise_id_idx" ON "exercise_item_targets"("exercise_id");

-- The reverse direction, and the one the generator will read: every exercise that practises
-- this atom. Without it, "what can I give this learner about `definite-plural`" is a scan.
CREATE INDEX "exercise_item_targets_atom_idx" ON "exercise_item_targets"("atom_type", "atom_id");

-- NULLS NOT DISTINCT, which the Prisma schema language cannot express — and without it the
-- unique does nothing at all for whole-exercise targets. `item_key` is NULL for every template
-- that grades as a whole, Postgres treats each NULL as distinct by default, and the same atom
-- could then be named on the same exercise without limit. Same trap, same fix as the
-- skill_mastery unique in analytics.
CREATE UNIQUE INDEX "exercise_item_targets_unique"
    ON "exercise_item_targets"("exercise_id", "item_key", "atom_type", "atom_id")
    NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "exercise_item_targets"
    ADD CONSTRAINT "exercise_item_targets_exercise_id_fkey"
    FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
