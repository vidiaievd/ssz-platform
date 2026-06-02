-- ─── Projection: EnrollmentProjection ────────────────────────────────────────

CREATE TABLE "enrollment_projection" (
    "enrollment_id" TEXT NOT NULL,
    "user_id"       TEXT NOT NULL,
    "container_id"  TEXT NOT NULL,
    "school_id"     TEXT,
    "status"        TEXT NOT NULL,
    "enrolled_at"   TIMESTAMP(3) NOT NULL,
    "completed_at"  TIMESTAMP(3),
    "unenrolled_at" TIMESTAMP(3),

    CONSTRAINT "enrollment_projection_pkey" PRIMARY KEY ("enrollment_id")
);

CREATE INDEX "enrollment_projection_user_id_idx"         ON "enrollment_projection"("user_id");
CREATE INDEX "enrollment_projection_school_id_idx"        ON "enrollment_projection"("school_id");
CREATE INDEX "enrollment_projection_container_id_idx"     ON "enrollment_projection"("container_id");
CREATE INDEX "enrollment_projection_school_id_status_idx" ON "enrollment_projection"("school_id", "status");

-- ─── Projection: ProgressActivity ─────────────────────────────────────────────

CREATE TABLE "progress_activity" (
    "id"           TEXT NOT NULL,
    "user_id"      TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_id"   TEXT NOT NULL,
    "kind"         TEXT NOT NULL,
    "occurred_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "progress_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "progress_activity_user_id_idx"              ON "progress_activity"("user_id");
CREATE INDEX "progress_activity_user_kind_occurred_idx"   ON "progress_activity"("user_id", "kind", "occurred_at");
CREATE INDEX "progress_activity_occurred_at_idx"          ON "progress_activity"("occurred_at");

-- ─── Projection: SubmissionProjection ─────────────────────────────────────────

CREATE TABLE "submission_projection" (
    "submission_id" TEXT NOT NULL,
    "user_id"       TEXT NOT NULL,
    "exercise_id"   TEXT NOT NULL,
    "assignment_id" TEXT,
    "school_id"     TEXT,
    "status"        TEXT NOT NULL,
    "submitted_at"  TIMESTAMP(3) NOT NULL,
    "reviewed_at"   TIMESTAMP(3),

    CONSTRAINT "submission_projection_pkey" PRIMARY KEY ("submission_id")
);

CREATE INDEX "submission_projection_school_id_status_idx" ON "submission_projection"("school_id", "status");
CREATE INDEX "submission_projection_user_id_idx"          ON "submission_projection"("user_id");
