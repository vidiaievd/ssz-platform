-- Learners' «helpful» / «not helpful» on the assistant's answers, per day × agent × model × prompt (plan 83, step 7).

CREATE TABLE "ai_assist_quality_daily" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "capability" TEXT NOT NULL,
    "model_id" TEXT,
    "prompt_version" TEXT,
    "helpful" INTEGER NOT NULL,
    "not_helpful" INTEGER NOT NULL,
    "with_reason" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_assist_quality_daily_pkey" PRIMARY KEY ("id")
);

-- NULLS NOT DISTINCT: an answer whose model or prompt is unknown still folds into one row.
CREATE UNIQUE INDEX "ai_assist_quality_daily_dims_key"
  ON "ai_assist_quality_daily" ("day", "capability", "model_id", "prompt_version")
  NULLS NOT DISTINCT;

CREATE INDEX "ai_assist_quality_daily_day_idx" ON "ai_assist_quality_daily" ("day");
