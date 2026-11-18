-- A school's purge content has started and not finished (plan 90, phase 5, step 4c; 4b-fix
-- item 3). `school.purged` arrives once: a purge that fails past the consumer's one retry stays
-- unfinished here, and the cleanup job runs it again.

CREATE TABLE "school_purges" (
    "school_id" UUID NOT NULL,
    "school_name" VARCHAR(200) NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "school_purges_pkey" PRIMARY KEY ("school_id")
);

CREATE INDEX "school_purges_completed_at_last_attempt_at_idx"
    ON "school_purges"("completed_at", "last_attempt_at");
