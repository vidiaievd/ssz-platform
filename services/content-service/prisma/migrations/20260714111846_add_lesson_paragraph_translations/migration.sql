-- CreateTable
CREATE TABLE "lesson_paragraph_translations" (
    "id" UUID NOT NULL,
    "lesson_content_variant_id" UUID NOT NULL,
    "paragraph_index" INTEGER NOT NULL,
    "translation" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lesson_paragraph_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_paragraph_translations_lesson_content_variant_id_idx" ON "lesson_paragraph_translations"("lesson_content_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_paragraph_translations_lesson_content_variant_id_par_key" ON "lesson_paragraph_translations"("lesson_content_variant_id", "paragraph_index");

-- AddForeignKey
ALTER TABLE "lesson_paragraph_translations" ADD CONSTRAINT "lesson_paragraph_translations_lesson_content_variant_id_fkey" FOREIGN KEY ("lesson_content_variant_id") REFERENCES "lesson_content_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
