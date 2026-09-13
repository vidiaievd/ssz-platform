-- Grammar rule atoms — plan 63, phase 0.
--
-- The unit a learner's memory will be kept against from phase 5 onwards, and the address
-- an exercise will point at from phase 1. A rule is a container of these, the way a
-- vocabulary list is a container of words; the two sides of the SRS become structurally
-- the same thing, which is why the machinery downstream gets written once and not twice.
--
-- Nothing reads this table yet. A rule with no atoms behaves exactly as it does today.

-- CreateEnum
CREATE TYPE "atom_track" AS ENUM ('lexis', 'grammar');

-- CreateTable
CREATE TABLE "grammar_rule_atoms" (
    "id" UUID NOT NULL,
    "grammar_rule_id" UUID NOT NULL,
    "key" VARCHAR(60) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "track" "atom_track" NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "grammar_rule_atoms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grammar_rule_atoms_grammar_rule_id_idx" ON "grammar_rule_atoms"("grammar_rule_id");
CREATE INDEX "grammar_rule_atoms_grammar_rule_id_deleted_at_idx" ON "grammar_rule_atoms"("grammar_rule_id", "deleted_at");

-- The key is unique inside a rule only among the living. Prisma cannot express a partial
-- unique index, so it is created here and documented in the schema instead. Without the
-- WHERE clause, retiring an atom would reserve its key inside that rule forever — and the
-- most likely reason to retire one is to re-cut it under a better name.
CREATE UNIQUE INDEX "grammar_rule_atoms_rule_key_unique"
    ON "grammar_rule_atoms"("grammar_rule_id", "key")
    WHERE "deleted_at" IS NULL;

-- Position is unique among the living too: a stable order the editor can rely on. Reorder
-- is the two-pass offset already used by the exercise pool — every row is first moved far
-- out of the way, then placed — so a swap never collides mid-transaction.
CREATE UNIQUE INDEX "grammar_rule_atoms_rule_position_unique"
    ON "grammar_rule_atoms"("grammar_rule_id", "position")
    WHERE "deleted_at" IS NULL;

-- The key is an address: lowercase kebab, so that what is written in an exercise target
-- and what is written here can never differ by case alone.
ALTER TABLE "grammar_rule_atoms"
    ADD CONSTRAINT "grammar_rule_atoms_key_format" CHECK ("key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "grammar_rule_atoms"
    ADD CONSTRAINT "grammar_rule_atoms_position_non_negative" CHECK ("position" >= 0);

-- AddForeignKey
ALTER TABLE "grammar_rule_atoms"
    ADD CONSTRAINT "grammar_rule_atoms_grammar_rule_id_fkey"
    FOREIGN KEY ("grammar_rule_id") REFERENCES "grammar_rules"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
