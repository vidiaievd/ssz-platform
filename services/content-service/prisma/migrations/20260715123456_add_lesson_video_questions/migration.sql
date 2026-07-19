-- CreateTable
CREATE TABLE "lesson_video_questions" (
    "id" UUID NOT NULL,
    "lesson_content_variant_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lesson_video_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_video_questions_lesson_content_variant_id_key" ON "lesson_video_questions"("lesson_content_variant_id");

-- CreateIndex
CREATE INDEX "lesson_video_questions_exercise_id_idx" ON "lesson_video_questions"("exercise_id");

-- AddForeignKey
ALTER TABLE "lesson_video_questions" ADD CONSTRAINT "lesson_video_questions_lesson_content_variant_id_fkey" FOREIGN KEY ("lesson_content_variant_id") REFERENCES "lesson_content_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_video_questions" ADD CONSTRAINT "lesson_video_questions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
