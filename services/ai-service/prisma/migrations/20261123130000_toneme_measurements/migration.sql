-- Plan 88, step 9.5 (OQ-2, variant A): every measured toneme take with the voices' carrier ranges.
CREATE TABLE "toneme_measurements" (
    "ai_call_id" TEXT NOT NULL,
    "language" VARCHAR(8) NOT NULL,
    "word" VARCHAR(64) NOT NULL,
    "tone" SMALLINT NOT NULL,
    "learner_score" DOUBLE PRECISION,
    "learner_frame_range" DOUBLE PRECISION,
    "reference_score" DOUBLE PRECISION NOT NULL,
    "reference_frame_range" DOUBLE PRECISION,
    "reference_voice" TEXT NOT NULL,
    "verdict" VARCHAR(16) NOT NULL,
    "session_id" TEXT,
    "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "toneme_measurements_pkey" PRIMARY KEY ("ai_call_id")
);

CREATE INDEX "toneme_measurements_language_word_idx" ON "toneme_measurements"("language", "word");
CREATE INDEX "toneme_measurements_measured_at_idx" ON "toneme_measurements"("measured_at");
