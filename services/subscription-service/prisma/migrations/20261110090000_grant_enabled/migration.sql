-- Plan 90, phase 3, step 1: a grant may switch its key off for the term.
ALTER TABLE "grants" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
