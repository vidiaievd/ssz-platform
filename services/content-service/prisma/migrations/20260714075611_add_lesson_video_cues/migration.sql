-- CreateTable
CREATE TABLE "lesson_video_cues" (
    "id" UUID NOT NULL,
    "lesson_content_variant_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "start_seconds" DOUBLE PRECISION NOT NULL,
    "target_line" TEXT NOT NULL,
    "translation_line" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lesson_video_cues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_video_cues_lesson_content_variant_id_idx" ON "lesson_video_cues"("lesson_content_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_video_cues_lesson_content_variant_id_position_key" ON "lesson_video_cues"("lesson_content_variant_id", "position");

-- AddForeignKey
ALTER TABLE "lesson_video_cues" ADD CONSTRAINT "lesson_video_cues_lesson_content_variant_id_fkey" FOREIGN KEY ("lesson_content_variant_id") REFERENCES "lesson_content_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
