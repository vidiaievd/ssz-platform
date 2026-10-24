-- CreateTable
CREATE TABLE "ai_eval_runs" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_by" TEXT NOT NULL,
    "binding_at_start" JSONB,
    "case_count" INTEGER NOT NULL,
    "skipped" JSONB NOT NULL,
    "scores" JSONB,
    "cases" JSONB,
    "cost_micros" BIGINT,
    "currency" TEXT,
    "credits" DECIMAL(18,6),
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ai_eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_eval_runs_capability_started_at_idx" ON "ai_eval_runs"("capability", "started_at");
