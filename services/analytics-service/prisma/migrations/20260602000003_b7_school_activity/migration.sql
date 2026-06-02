-- ─── Audit: SchoolActivity ────────────────────────────────────────────────────

CREATE TABLE "school_activity" (
    "id"          TEXT NOT NULL,
    "school_id"   TEXT NOT NULL,
    "actor_id"    TEXT,
    "actor_name"  TEXT,
    "event_type"  TEXT NOT NULL,
    "tag"         TEXT NOT NULL,
    "what"        TEXT NOT NULL,
    "target"      TEXT,
    "target_id"   TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "school_activity_school_id_occurred_at_idx"
    ON "school_activity"("school_id", "occurred_at" DESC);
