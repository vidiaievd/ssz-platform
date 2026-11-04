-- The `sound` atoms of a language and what a learner reads about them (plan 86, step 8.1).
-- Ids are natural keys (`nb:kj`), not uuids: the families are defined by ai-service's
-- measuring code. Rows are seeded by prisma/seed-sound-atoms.ts.

CREATE TABLE "sound_atoms" (
    "id" VARCHAR(40) NOT NULL,
    "language" VARCHAR(8) NOT NULL,
    "family" VARCHAR(32) NOT NULL,
    "ipa" VARCHAR(40) NOT NULL,
    "scored" BOOLEAN NOT NULL,
    "position" INTEGER NOT NULL,
    "carrier_words" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sound_atoms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sound_atoms_language_family_key" ON "sound_atoms"("language", "family");
CREATE INDEX "sound_atoms_language_position_idx" ON "sound_atoms"("language", "position");

CREATE TABLE "sound_atom_texts" (
    "sound_atom_id" VARCHAR(40) NOT NULL,
    "locale" VARCHAR(8) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "how_to" TEXT,
    "common_error" TEXT,
    "uk_note" TEXT,
    "drill" TEXT,

    CONSTRAINT "sound_atom_texts_pkey" PRIMARY KEY ("sound_atom_id", "locale")
);

ALTER TABLE "sound_atom_texts" ADD CONSTRAINT "sound_atom_texts_sound_atom_id_fkey"
    FOREIGN KEY ("sound_atom_id") REFERENCES "sound_atoms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
