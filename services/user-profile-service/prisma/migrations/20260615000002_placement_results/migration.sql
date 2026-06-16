-- placement_results: stores CEFR placement test outcomes.
-- scope='platform' — one per (user_id, language); feeds recommendations globally.
-- scope='membership' — per school membership; never overwrites platform result.

CREATE TYPE "placement_scope" AS ENUM ('platform', 'membership');

CREATE TABLE "placement_results" (
  "id"            TEXT          NOT NULL PRIMARY KEY,
  "user_id"       TEXT          NOT NULL,
  "language"      CHAR(2)       NOT NULL,
  "cefr_level"    TEXT          NOT NULL,
  "score"         INTEGER       NOT NULL,
  "scope"         "placement_scope" NOT NULL,
  "membership_id" TEXT,
  "source_label"  TEXT          NOT NULL,
  "taken_at"      TIMESTAMPTZ   NOT NULL,
  "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX "placement_results_user_id_language_scope_idx"
  ON "placement_results"("user_id", "language", "scope");

CREATE INDEX "placement_results_user_id_idx"
  ON "placement_results"("user_id");
