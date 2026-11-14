-- Review quality per exercise template, for the gate that lets a model review a template's work
-- by itself (plan 79, Q2; plan 90, phase 7, step 10).
--
-- `template_code` joins the row's axes; rows folded before it stay NULL — the events they came
-- from are consumed and the template cannot be recovered. `drafts_settled` counts the drafts a
-- teacher acted on, of any agent: on `review_draft` rows that is exactly `reviews`, so those are
-- backfilled; on `review_direct` rows it was never counted and stays 0.

ALTER TABLE "ai_draft_quality_daily" ADD COLUMN "template_code" TEXT;
ALTER TABLE "ai_draft_quality_daily" ADD COLUMN "drafts_settled" INTEGER NOT NULL DEFAULT 0;

UPDATE "ai_draft_quality_daily" SET "drafts_settled" = "reviews" WHERE "capability" = 'review_draft';

DROP INDEX "ai_draft_quality_daily_dims_key";

-- NULLS NOT DISTINCT, as before: an unknown model, prompt or template still folds into one row.
CREATE UNIQUE INDEX "ai_draft_quality_daily_dims_key"
  ON "ai_draft_quality_daily" ("day", "capability", "model_id", "prompt_version", "template_code")
  NULLS NOT DISTINCT;
