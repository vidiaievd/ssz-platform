-- CreateEnum
CREATE TYPE "grammar_topic" AS ENUM ('verbs', 'nouns', 'adjectives', 'adverbs', 'pronouns', 'articles', 'prepositions', 'conjunctions', 'word_order', 'tenses', 'cases', 'mood', 'voice', 'numerals', 'other');

-- CreateTable
CREATE TABLE "exercise_templates" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "content_schema" JSONB NOT NULL,
    "answer_schema" JSONB NOT NULL,
    "default_check_settings" JSONB,
    "supported_languages" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "exercise_template_id" UUID NOT NULL,
    "target_language" VARCHAR(10) NOT NULL,
    "difficulty_level" "difficulty_level" NOT NULL,
    "content" JSONB NOT NULL,
    "expected_answers" JSONB NOT NULL,
    "answer_check_settings" JSONB,
    "owner_user_id" UUID NOT NULL,
    "owner_school_id" UUID,
    "visibility" "visibility" NOT NULL,
    "estimated_duration_seconds" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_instructions" (
    "id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "instruction_language" VARCHAR(10) NOT NULL,
    "instruction_text" TEXT NOT NULL,
    "hint_text" TEXT,
    "text_overrides" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "exercise_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_rules" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120),
    "target_language" VARCHAR(10) NOT NULL,
    "difficulty_level" "difficulty_level" NOT NULL,
    "topic" "grammar_topic" NOT NULL,
    "subtopic" VARCHAR(100),
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "owner_user_id" UUID NOT NULL,
    "owner_school_id" UUID,
    "visibility" "visibility" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "grammar_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_rule_explanations" (
    "id" UUID NOT NULL,
    "grammar_rule_id" UUID NOT NULL,
    "explanation_language" VARCHAR(10) NOT NULL,
    "min_level" "difficulty_level" NOT NULL,
    "max_level" "difficulty_level" NOT NULL,
    "display_title" VARCHAR(200) NOT NULL,
    "display_summary" TEXT,
    "body_markdown" TEXT NOT NULL,
    "estimated_reading_minutes" INTEGER,
    "status" "variant_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "last_edited_by_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "grammar_rule_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_rule_exercise_pool" (
    "id" UUID NOT NULL,
    "grammar_rule_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "added_by_user_id" UUID NOT NULL,

    CONSTRAINT "grammar_rule_exercise_pool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercise_templates_code_key" ON "exercise_templates"("code");

-- CreateIndex
CREATE INDEX "exercises_exercise_template_id_idx" ON "exercises"("exercise_template_id");

-- CreateIndex
CREATE INDEX "exercises_owner_user_id_idx" ON "exercises"("owner_user_id");

-- CreateIndex
CREATE INDEX "exercises_owner_school_id_idx" ON "exercises"("owner_school_id");

-- CreateIndex
CREATE INDEX "exercises_visibility_idx" ON "exercises"("visibility");

-- CreateIndex
CREATE INDEX "exercises_target_language_difficulty_level_idx" ON "exercises"("target_language", "difficulty_level");

-- CreateIndex
CREATE INDEX "exercises_deleted_at_visibility_target_language_idx" ON "exercises"("deleted_at", "visibility", "target_language");

-- CreateIndex
CREATE INDEX "exercise_instructions_exercise_id_idx" ON "exercise_instructions"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_instructions_exercise_id_instruction_language_key" ON "exercise_instructions"("exercise_id", "instruction_language");

-- CreateIndex
CREATE INDEX "grammar_rules_owner_user_id_idx" ON "grammar_rules"("owner_user_id");

-- CreateIndex
CREATE INDEX "grammar_rules_owner_school_id_idx" ON "grammar_rules"("owner_school_id");

-- CreateIndex
CREATE INDEX "grammar_rules_visibility_idx" ON "grammar_rules"("visibility");

-- CreateIndex
CREATE INDEX "grammar_rules_target_language_difficulty_level_idx" ON "grammar_rules"("target_language", "difficulty_level");

-- CreateIndex
CREATE INDEX "grammar_rules_topic_idx" ON "grammar_rules"("topic");

-- CreateIndex
CREATE INDEX "grammar_rules_deleted_at_visibility_target_language_idx" ON "grammar_rules"("deleted_at", "visibility", "target_language");

-- CreateIndex
CREATE INDEX "grammar_rule_explanations_grammar_rule_id_idx" ON "grammar_rule_explanations"("grammar_rule_id");

-- CreateIndex
CREATE INDEX "grammar_rule_explanations_grammar_rule_id_status_idx" ON "grammar_rule_explanations"("grammar_rule_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_rule_explanations_grammar_rule_id_explanation_langu_key" ON "grammar_rule_explanations"("grammar_rule_id", "explanation_language", "min_level", "max_level");

-- CreateIndex
CREATE INDEX "grammar_rule_exercise_pool_grammar_rule_id_idx" ON "grammar_rule_exercise_pool"("grammar_rule_id");

-- CreateIndex
CREATE INDEX "grammar_rule_exercise_pool_exercise_id_idx" ON "grammar_rule_exercise_pool"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_rule_exercise_pool_grammar_rule_id_exercise_id_key" ON "grammar_rule_exercise_pool"("grammar_rule_id", "exercise_id");

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_exercise_template_id_fkey" FOREIGN KEY ("exercise_template_id") REFERENCES "exercise_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_instructions" ADD CONSTRAINT "exercise_instructions_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_rule_explanations" ADD CONSTRAINT "grammar_rule_explanations_grammar_rule_id_fkey" FOREIGN KEY ("grammar_rule_id") REFERENCES "grammar_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_rule_exercise_pool" ADD CONSTRAINT "grammar_rule_exercise_pool_grammar_rule_id_fkey" FOREIGN KEY ("grammar_rule_id") REFERENCES "grammar_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_rule_exercise_pool" ADD CONSTRAINT "grammar_rule_exercise_pool_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
