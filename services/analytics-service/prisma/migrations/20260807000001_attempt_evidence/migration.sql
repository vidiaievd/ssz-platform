-- ─── Projection: AttemptEvidence (plan 36 §A.1) ───────────────────────────────
-- One row per attempt that actually moved an SRS card. Measurement table for
-- calibrating the evidence-strength ceilings; the learner's answer is never stored.

CREATE TABLE "attempt_evidence" (
    "id"                     TEXT NOT NULL,
    "event_id"               TEXT NOT NULL,
    "user_id"                TEXT NOT NULL,
    "exercise_id"            TEXT NOT NULL,
    "template_code"          TEXT,
    "answer_mode"            TEXT,
    "bank_size"              INTEGER,
    "words_consumed"         BOOLEAN,
    "score"                  INTEGER NOT NULL,
    "passed"                 BOOLEAN,
    "attempt_ordinal"        INTEGER NOT NULL,
    "days_since_last_review" DOUBLE PRECISION,
    "gap_position"           INTEGER,
    "gap_count"              INTEGER,
    "rating_applied"         TEXT NOT NULL,
    "occurred_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempt_evidence_pkey" PRIMARY KEY ("id")
);

-- One row per event: the consumer is at-least-once, and a redelivery must not
-- double-count a form's evidence.
CREATE UNIQUE INDEX "attempt_evidence_event_id_key"
    ON "attempt_evidence"("event_id");

CREATE INDEX "attempt_evidence_template_code_answer_mode_occurred_at_idx"
    ON "attempt_evidence"("template_code", "answer_mode", "occurred_at");

CREATE INDEX "attempt_evidence_user_id_occurred_at_idx"
    ON "attempt_evidence"("user_id", "occurred_at");
