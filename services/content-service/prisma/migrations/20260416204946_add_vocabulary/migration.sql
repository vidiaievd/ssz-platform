-- CreateEnum
CREATE TYPE "part_of_speech" AS ENUM ('noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'numeral', 'particle', 'phrase', 'other');

-- CreateEnum
CREATE TYPE "register" AS ENUM ('formal', 'informal', 'neutral', 'colloquial', 'slang', 'archaic', 'dialect');

-- CreateTable
CREATE TABLE "vocabulary_lists" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120),
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "target_language" VARCHAR(10) NOT NULL,
    "difficulty_level" "difficulty_level" NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "owner_school_id" UUID,
    "visibility" "visibility" NOT NULL,
    "auto_add_to_srs" BOOLEAN NOT NULL DEFAULT true,
    "cover_image_media_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "vocabulary_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_items" (
    "id" UUID NOT NULL,
    "vocabulary_list_id" UUID NOT NULL,
    "word" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL,
    "part_of_speech" "part_of_speech",
    "ipa_transcription" VARCHAR(200),
    "pronunciation_audio_media_id" UUID,
    "grammatical_properties" JSONB,
    "register" "register",
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "vocabulary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_item_translations" (
    "id" UUID NOT NULL,
    "vocabulary_item_id" UUID NOT NULL,
    "translation_language" VARCHAR(10) NOT NULL,
    "primary_translation" VARCHAR(300) NOT NULL,
    "alternative_translations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "definition" TEXT,
    "usage_notes" TEXT,
    "false_friend_warning" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "last_edited_by_user_id" UUID NOT NULL,

    CONSTRAINT "vocabulary_item_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_usage_examples" (
    "id" UUID NOT NULL,
    "vocabulary_item_id" UUID NOT NULL,
    "example_text" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "audio_media_id" UUID,
    "context_note" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vocabulary_usage_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_example_translations" (
    "id" UUID NOT NULL,
    "vocabulary_usage_example_id" UUID NOT NULL,
    "translation_language" VARCHAR(10) NOT NULL,
    "translated_text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vocabulary_example_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vocabulary_lists_owner_user_id_idx" ON "vocabulary_lists"("owner_user_id");

-- CreateIndex
CREATE INDEX "vocabulary_lists_owner_school_id_idx" ON "vocabulary_lists"("owner_school_id");

-- CreateIndex
CREATE INDEX "vocabulary_lists_visibility_idx" ON "vocabulary_lists"("visibility");

-- CreateIndex
CREATE INDEX "vocabulary_lists_target_language_difficulty_level_idx" ON "vocabulary_lists"("target_language", "difficulty_level");

-- CreateIndex
CREATE INDEX "vocabulary_lists_deleted_at_visibility_target_language_idx" ON "vocabulary_lists"("deleted_at", "visibility", "target_language");

-- CreateIndex
CREATE INDEX "vocabulary_items_vocabulary_list_id_idx" ON "vocabulary_items"("vocabulary_list_id");

-- CreateIndex
CREATE INDEX "vocabulary_items_vocabulary_list_id_deleted_at_idx" ON "vocabulary_items"("vocabulary_list_id", "deleted_at");

-- CreateIndex
CREATE INDEX "vocabulary_items_part_of_speech_idx" ON "vocabulary_items"("part_of_speech");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_items_vocabulary_list_id_position_key" ON "vocabulary_items"("vocabulary_list_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_items_vocabulary_list_id_word_key" ON "vocabulary_items"("vocabulary_list_id", "word");

-- CreateIndex
CREATE INDEX "vocabulary_item_translations_vocabulary_item_id_idx" ON "vocabulary_item_translations"("vocabulary_item_id");

-- CreateIndex
CREATE INDEX "vocabulary_item_translations_translation_language_idx" ON "vocabulary_item_translations"("translation_language");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_item_translations_vocabulary_item_id_translation_key" ON "vocabulary_item_translations"("vocabulary_item_id", "translation_language");

-- CreateIndex
CREATE INDEX "vocabulary_usage_examples_vocabulary_item_id_idx" ON "vocabulary_usage_examples"("vocabulary_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_usage_examples_vocabulary_item_id_position_key" ON "vocabulary_usage_examples"("vocabulary_item_id", "position");

-- CreateIndex
CREATE INDEX "vocabulary_example_translations_vocabulary_usage_example_id_idx" ON "vocabulary_example_translations"("vocabulary_usage_example_id");

-- CreateIndex
CREATE UNIQUE INDEX "vocabulary_example_translations_vocabulary_usage_example_id_key" ON "vocabulary_example_translations"("vocabulary_usage_example_id", "translation_language");

-- AddForeignKey
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_vocabulary_list_id_fkey" FOREIGN KEY ("vocabulary_list_id") REFERENCES "vocabulary_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_item_translations" ADD CONSTRAINT "vocabulary_item_translations_vocabulary_item_id_fkey" FOREIGN KEY ("vocabulary_item_id") REFERENCES "vocabulary_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_usage_examples" ADD CONSTRAINT "vocabulary_usage_examples_vocabulary_item_id_fkey" FOREIGN KEY ("vocabulary_item_id") REFERENCES "vocabulary_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_example_translations" ADD CONSTRAINT "vocabulary_example_translations_vocabulary_usage_example_i_fkey" FOREIGN KEY ("vocabulary_usage_example_id") REFERENCES "vocabulary_usage_examples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
