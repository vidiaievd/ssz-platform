-- What teachers did with models' review drafts, per day × agent × model × prompt (plan 79, step 1.5).

CREATE TABLE "ai_draft_quality_daily" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "capability" TEXT NOT NULL,
    "model_id" TEXT,
    "prompt_version" TEXT,
    "reviews" INTEGER NOT NULL,
    "remarks_accepted" INTEGER NOT NULL,
    "remarks_edited" INTEGER NOT NULL,
    "remarks_discarded" INTEGER NOT NULL,
    "remarks_untouched" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_draft_quality_daily_pkey" PRIMARY KEY ("id")
);

-- NULLS NOT DISTINCT: a draft whose model or prompt is unknown still folds into one row.
CREATE UNIQUE INDEX "ai_draft_quality_daily_dims_key"
  ON "ai_draft_quality_daily" ("day", "capability", "model_id", "prompt_version")
  NULLS NOT DISTINCT;

CREATE INDEX "ai_draft_quality_daily_day_idx" ON "ai_draft_quality_daily" ("day");
