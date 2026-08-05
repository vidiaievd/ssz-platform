-- CreateEnum
CREATE TYPE "lesson_span_kind" AS ENUM ('vocab', 'grammar', 'chunk');

-- CreateTable
CREATE TABLE "lesson_text_spans" (
    "id" UUID NOT NULL,
    "lesson_content_variant_id" UUID NOT NULL,
    "paragraph_index" INTEGER NOT NULL,
    "char_start" INTEGER NOT NULL,
    "char_end" INTEGER NOT NULL,
    "kind" "lesson_span_kind" NOT NULL,
    "ref_id" UUID,
    "text_snapshot" VARCHAR(400) NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "lesson_text_spans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lesson_text_spans_lesson_content_variant_id_idx" ON "lesson_text_spans"("lesson_content_variant_id");

-- CreateIndex
CREATE INDEX "lesson_text_spans_lesson_content_variant_id_paragraph_index_idx" ON "lesson_text_spans"("lesson_content_variant_id", "paragraph_index");

-- CreateIndex
CREATE INDEX "lesson_text_spans_ref_id_idx" ON "lesson_text_spans"("ref_id");

-- AddForeignKey
ALTER TABLE "lesson_text_spans" ADD CONSTRAINT "lesson_text_spans_lesson_content_variant_id_fkey" FOREIGN KEY ("lesson_content_variant_id") REFERENCES "lesson_content_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── CHECK constraints ───────────────────────────────────────────────────────
-- Offsets are a half-open range [char_start, char_end); an empty or inverted
-- range is never a valid annotation.

ALTER TABLE "lesson_text_spans"
  ADD CONSTRAINT "chk_lesson_text_spans_range"
    CHECK (char_start >= 0 AND char_end > char_start);

ALTER TABLE "lesson_text_spans"
  ADD CONSTRAINT "chk_lesson_text_spans_paragraph_index"
    CHECK (paragraph_index >= 0);

-- ref_id is polymorphic and has no FK, so the one thing the database can still
-- guarantee is that it agrees with `kind`: chunks reference nothing, the other
-- two kinds must reference something.

ALTER TABLE "lesson_text_spans"
  ADD CONSTRAINT "chk_lesson_text_spans_ref_by_kind"
    CHECK ((kind = 'chunk' AND ref_id IS NULL) OR (kind <> 'chunk' AND ref_id IS NOT NULL));

-- No unique constraint: two spans of different kinds legitimately share a range
-- (a vocab word inside a marked chunk). Same-kind overlap — which subsumes exact
-- duplicates — is rejected in the application layer, where the offending span
-- can be named in the error.
