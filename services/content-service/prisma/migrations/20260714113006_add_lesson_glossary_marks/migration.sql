-- CreateTable
CREATE TABLE "lesson_variant_glossary_marks" (
    "id" UUID NOT NULL,
    "lesson_content_variant_id" UUID NOT NULL,
    "vocabulary_item_id" UUID NOT NULL,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lesson_variant_glossary_marks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_variant_glossary_marks_lesson_content_variant_id_idx" ON "lesson_variant_glossary_marks"("lesson_content_variant_id");

-- CreateIndex
CREATE INDEX "lesson_variant_glossary_marks_vocabulary_item_id_idx" ON "lesson_variant_glossary_marks"("vocabulary_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_variant_glossary_marks_lesson_content_variant_id_voc_key" ON "lesson_variant_glossary_marks"("lesson_content_variant_id", "vocabulary_item_id");

-- AddForeignKey
ALTER TABLE "lesson_variant_glossary_marks" ADD CONSTRAINT "lesson_variant_glossary_marks_lesson_content_variant_id_fkey" FOREIGN KEY ("lesson_content_variant_id") REFERENCES "lesson_content_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_variant_glossary_marks" ADD CONSTRAINT "lesson_variant_glossary_marks_vocabulary_item_id_fkey" FOREIGN KEY ("vocabulary_item_id") REFERENCES "vocabulary_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
