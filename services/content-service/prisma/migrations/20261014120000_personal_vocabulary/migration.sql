-- Plan 75: words a student adds to their own dictionary from a text.

CREATE TABLE "personal_vocabulary_lists" (
    "user_id" UUID NOT NULL,
    "target_language" VARCHAR(10) NOT NULL,
    "vocabulary_list_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_vocabulary_lists_pkey" PRIMARY KEY ("user_id","target_language")
);

CREATE UNIQUE INDEX "personal_vocabulary_lists_vocabulary_list_id_key" ON "personal_vocabulary_lists"("vocabulary_list_id");

ALTER TABLE "personal_vocabulary_lists" ADD CONSTRAINT "personal_vocabulary_lists_vocabulary_list_id_fkey" FOREIGN KEY ("vocabulary_list_id") REFERENCES "vocabulary_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "personal_vocabulary_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_language" VARCHAR(10) NOT NULL,
    "vocabulary_item_id" UUID NOT NULL,
    "surface_form" VARCHAR(200) NOT NULL,
    "context_sentence" TEXT,
    "source_variant_id" UUID,
    "source_paragraph" INTEGER,
    "source_char_start" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "personal_vocabulary_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "personal_vocabulary_entries_surface_form_check" CHECK (length(trim("surface_form")) > 0)
);

CREATE UNIQUE INDEX "personal_vocabulary_entries_user_id_vocabulary_item_id_key" ON "personal_vocabulary_entries"("user_id", "vocabulary_item_id");
CREATE INDEX "personal_vocabulary_entries_user_id_target_language_created_at_idx" ON "personal_vocabulary_entries"("user_id", "target_language", "created_at");
CREATE INDEX "personal_vocabulary_entries_source_variant_id_idx" ON "personal_vocabulary_entries"("source_variant_id");

ALTER TABLE "personal_vocabulary_entries" ADD CONSTRAINT "personal_vocabulary_entries_vocabulary_item_id_fkey" FOREIGN KEY ("vocabulary_item_id") REFERENCES "vocabulary_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
