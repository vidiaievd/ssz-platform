-- CreateEnum
CREATE TYPE "listening_stage_type" AS ENUM ('gap_fill', 'comprehension');

-- AlterTable
ALTER TABLE "lesson_content_variants" ADD COLUMN     "transcript" TEXT;

-- CreateTable
CREATE TABLE "lesson_listening_stages" (
    "id" UUID NOT NULL,
    "lesson_content_variant_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "stage_type" "listening_stage_type" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_listening_stages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_listening_stages_lesson_content_variant_id_idx" ON "lesson_listening_stages"("lesson_content_variant_id");

-- CreateIndex
CREATE INDEX "lesson_listening_stages_exercise_id_idx" ON "lesson_listening_stages"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_listening_stages_lesson_content_variant_id_position_key" ON "lesson_listening_stages"("lesson_content_variant_id", "position");

-- AddForeignKey
ALTER TABLE "lesson_listening_stages" ADD CONSTRAINT "lesson_listening_stages_lesson_content_variant_id_fkey" FOREIGN KEY ("lesson_content_variant_id") REFERENCES "lesson_content_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_listening_stages" ADD CONSTRAINT "lesson_listening_stages_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
