-- ─── A refusal says which budget refused (plan 63 phase 6) ───────────────────
-- The daily caps split into a lexical and a grammatical one. Without this column the
-- refusals stop being readable the moment there are two of them: "the cap turned 40
-- reviews away today" cannot be acted on if nobody can say which cap.
--
-- Nullable and not backfilled: every row here predates the split, and writing 'lexis'
-- into them would turn "nobody recorded it" into an observation.

ALTER TABLE "srs_limit_refusals" ADD COLUMN "track" TEXT;

CREATE INDEX "srs_limit_refusals_track_occurred_at_idx"
  ON "srs_limit_refusals" ("track", "occurred_at");
