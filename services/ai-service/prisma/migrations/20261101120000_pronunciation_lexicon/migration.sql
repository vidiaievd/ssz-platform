-- Pronunciation lexicon (plan 88, step 1): NB Uttale transcriptions with the toneme, read by
-- the voice review to name the sounds Azure scores. Filled by prisma/lexicon/import-nb-uttale.ts.

CREATE TABLE "pronunciation_lexicon" (
    "id" BIGSERIAL NOT NULL,
    "language" TEXT NOT NULL,
    "dialect" TEXT NOT NULL,
    "word_key" TEXT NOT NULL,
    "wordform" TEXT NOT NULL,
    "pos" TEXT NOT NULL,
    "feats" TEXT NOT NULL,
    "nofabet" TEXT NOT NULL,
    "ipa" TEXT NOT NULL,
    "tone" SMALLINT,
    "in_written" BOOLEAN NOT NULL,
    "in_spoken" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "pronunciation_lexicon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pronunciation_lexicon_entry_key" ON "pronunciation_lexicon"("language", "dialect", "source", "wordform", "pos", "feats", "nofabet");

CREATE INDEX "pronunciation_lexicon_language_dialect_word_key_idx" ON "pronunciation_lexicon"("language", "dialect", "word_key");
