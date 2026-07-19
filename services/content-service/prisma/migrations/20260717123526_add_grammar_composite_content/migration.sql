-- AlterTable
ALTER TABLE "grammar_rule_explanations" ADD COLUMN     "anchor_highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "anchor_note" TEXT,
ADD COLUMN     "anchor_text" TEXT;

-- CreateTable
CREATE TABLE "grammar_rule_compare_examples" (
    "id" UUID NOT NULL,
    "explanation_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "sentence" TEXT NOT NULL,
    "note" TEXT,
    "is_correct" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "grammar_rule_compare_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_rule_quick_checks" (
    "id" UUID NOT NULL,
    "explanation_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "correct_option_index" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "grammar_rule_quick_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "grammar_rule_compare_examples_explanation_id_idx" ON "grammar_rule_compare_examples"("explanation_id");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_rule_compare_examples_explanation_id_position_key" ON "grammar_rule_compare_examples"("explanation_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "grammar_rule_quick_checks_explanation_id_key" ON "grammar_rule_quick_checks"("explanation_id");

-- AddForeignKey
ALTER TABLE "grammar_rule_compare_examples" ADD CONSTRAINT "grammar_rule_compare_examples_explanation_id_fkey" FOREIGN KEY ("explanation_id") REFERENCES "grammar_rule_explanations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_rule_quick_checks" ADD CONSTRAINT "grammar_rule_quick_checks_explanation_id_fkey" FOREIGN KEY ("explanation_id") REFERENCES "grammar_rule_explanations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
