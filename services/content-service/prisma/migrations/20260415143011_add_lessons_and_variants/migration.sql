-- CreateEnum
CREATE TYPE "variant_status" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "media_ref_type" AS ENUM ('image', 'audio', 'video');

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "target_language" VARCHAR(10) NOT NULL,
    "difficulty_level" "difficulty_level" NOT NULL,
    "slug" VARCHAR(120),
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "cover_image_media_id" UUID,
    "owner_user_id" UUID NOT NULL,
    "owner_school_id" UUID,
    "visibility" "visibility" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_content_variants" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "explanation_language" VARCHAR(10) NOT NULL,
    "min_level" "difficulty_level" NOT NULL,
    "max_level" "difficulty_level" NOT NULL,
    "display_title" VARCHAR(200) NOT NULL,
    "display_description" TEXT,
    "body_markdown" TEXT NOT NULL,
    "estimated_reading_minutes" INTEGER,
    "status" "variant_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "last_edited_by_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "lesson_content_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_variant_media_refs" (
    "id" UUID NOT NULL,
    "lesson_content_variant_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "media_type" "media_ref_type" NOT NULL,
    "position_in_text" INTEGER NOT NULL,
    "extracted_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lesson_variant_media_refs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lessons_owner_user_id_idx" ON "lessons"("owner_user_id");

-- CreateIndex
CREATE INDEX "lessons_owner_school_id_idx" ON "lessons"("owner_school_id");

-- CreateIndex
CREATE INDEX "lessons_visibility_idx" ON "lessons"("visibility");

-- CreateIndex
CREATE INDEX "lessons_target_language_difficulty_level_idx" ON "lessons"("target_language", "difficulty_level");

-- CreateIndex
CREATE INDEX "lessons_deleted_at_visibility_target_language_idx" ON "lessons"("deleted_at", "visibility", "target_language");

-- CreateIndex
CREATE INDEX "lesson_content_variants_lesson_id_idx" ON "lesson_content_variants"("lesson_id");

-- CreateIndex
CREATE INDEX "lesson_content_variants_lesson_id_status_idx" ON "lesson_content_variants"("lesson_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_content_variants_lesson_id_explanation_language_min__key" ON "lesson_content_variants"("lesson_id", "explanation_language", "min_level", "max_level");

-- CreateIndex
CREATE INDEX "lesson_variant_media_refs_lesson_content_variant_id_idx" ON "lesson_variant_media_refs"("lesson_content_variant_id");

-- CreateIndex
CREATE INDEX "lesson_variant_media_refs_media_id_idx" ON "lesson_variant_media_refs"("media_id");

-- AddForeignKey
ALTER TABLE "lesson_content_variants" ADD CONSTRAINT "lesson_content_variants_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_variant_media_refs" ADD CONSTRAINT "lesson_variant_media_refs_lesson_content_variant_id_fkey" FOREIGN KEY ("lesson_content_variant_id") REFERENCES "lesson_content_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
