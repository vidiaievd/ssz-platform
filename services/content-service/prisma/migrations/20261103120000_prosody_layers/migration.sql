-- The author's intonation marks beside a text (plan 86, step 5): one layer per TEXT lesson
-- variant body and one per read_aloud prompt. The texts themselves are not changed.

CREATE TABLE "lesson_prosody_layers" (
    "lesson_content_variant_id" UUID NOT NULL,
    "source_text" TEXT NOT NULL,
    "layer" JSONB NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lesson_prosody_layers_pkey" PRIMARY KEY ("lesson_content_variant_id")
);

CREATE TABLE "exercise_prosody_layers" (
    "exercise_id" UUID NOT NULL,
    "prompt_id" VARCHAR(64) NOT NULL,
    "source_text" TEXT NOT NULL,
    "layer" JSONB NOT NULL,
    "updated_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "exercise_prosody_layers_pkey" PRIMARY KEY ("exercise_id", "prompt_id")
);

ALTER TABLE "lesson_prosody_layers" ADD CONSTRAINT "lesson_prosody_layers_lesson_content_variant_id_fkey"
    FOREIGN KEY ("lesson_content_variant_id") REFERENCES "lesson_content_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exercise_prosody_layers" ADD CONSTRAINT "exercise_prosody_layers_exercise_id_fkey"
    FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
