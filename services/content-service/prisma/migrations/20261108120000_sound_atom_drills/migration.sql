-- Drill material of the scored `sound` atoms and the platform's reference clips of its words
-- (plan 86, step 13.2). Seeded by prisma/seed-sound-atoms.ts; the clips are written by
-- prisma/tools/reference-sound-atoms.ts.

CREATE TABLE "sound_atom_drills" (
    "sound_atom_id" VARCHAR(40) NOT NULL,
    "words" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pairs" JSONB NOT NULL DEFAULT '[]',
    "diagnostic" VARCHAR(64) NOT NULL,
    "phrases" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sound_atom_drills_pkey" PRIMARY KEY ("sound_atom_id")
);

ALTER TABLE "sound_atom_drills" ADD CONSTRAINT "sound_atom_drills_sound_atom_id_fkey"
    FOREIGN KEY ("sound_atom_id") REFERENCES "sound_atoms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sound_reference_clips" (
    "language" VARCHAR(8) NOT NULL,
    "word" VARCHAR(64) NOT NULL,
    "asset_id" UUID,
    "tone" SMALLINT,
    "refusal" VARCHAR(32),
    "checked_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sound_reference_clips_pkey" PRIMARY KEY ("language", "word")
);
