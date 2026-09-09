-- ─── Projection: SkillMastery (plan 55 §4) ────────────────────────────────────
-- One row per (learner × course × skill × focus). Built from learning.attempt.rated,
-- in the same consumer as attempt_evidence: that table is the record, this one is the
-- running answer, and keeping both is what makes a change of weights recomputable.

CREATE TABLE "skill_mastery" (
    "id"                      TEXT NOT NULL,
    "user_id"                 TEXT NOT NULL,
    "course_id"               TEXT,
    "skill"                   TEXT NOT NULL,
    "focus"                   TEXT NOT NULL,
    "success_rate_ewma"       DOUBLE PRECISION NOT NULL,
    "mean_stability"          DOUBLE PRECISION,
    "median_seconds_per_item" DOUBLE PRECISION,
    "attempts"                INTEGER NOT NULL DEFAULT 0,
    "weighted_sample"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_attempt_at"         TIMESTAMP(3) NOT NULL,
    "updated_at"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_mastery_pkey" PRIMARY KEY ("id")
);

-- NULLS NOT DISTINCT: practice outside a course must collapse into one row per cell,
-- not a new row per attempt. Postgres treats NULLs in a unique index as distinct by
-- default, which would quietly turn the no-course profile into an append-only log.
CREATE UNIQUE INDEX "skill_mastery_user_id_course_id_skill_focus_key"
    ON "skill_mastery" ("user_id", "course_id", "skill", "focus") NULLS NOT DISTINCT;

CREATE INDEX "skill_mastery_user_id_updated_at_idx" ON "skill_mastery" ("user_id", "updated_at");
