-- Plan 90, phase 8, step 3: history of media sweep runs (kept 90 days).
CREATE TABLE "sweep_runs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "actor_id" TEXT,
    "report" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "sweep_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sweep_runs_kind_check"
        CHECK ("kind" IN ('orphan_recordings', 'superseded_narrations', 'abandoned_uploads', 'orphan_content')),
    CONSTRAINT "sweep_runs_mode_check" CHECK ("mode" IN ('dry-run', 'delete')),
    CONSTRAINT "sweep_runs_trigger_check" CHECK ("trigger" IN ('nightly', 'admin', 'operator'))
);

CREATE INDEX "sweep_runs_kind_started_at_idx" ON "sweep_runs"("kind", "started_at");
CREATE INDEX "sweep_runs_started_at_idx" ON "sweep_runs"("started_at");
