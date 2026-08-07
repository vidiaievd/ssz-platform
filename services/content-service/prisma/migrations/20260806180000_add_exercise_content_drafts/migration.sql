-- Unreleased edits to an exercise's document and its instruction text.
-- Authoring writes here; the live columns keep serving students until the
-- container placing the exercise is published, which promotes the draft.
-- `draft_updated_at` is the flag for "something is waiting": when it is set,
-- the sibling draft columns hold the complete document to release.

-- AlterTable
ALTER TABLE "exercises"
  ADD COLUMN "draft_content" JSONB,
  ADD COLUMN "draft_expected_answers" JSONB,
  ADD COLUMN "draft_answer_check_settings" JSONB,
  ADD COLUMN "draft_updated_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "exercise_instructions"
  ADD COLUMN "draft_instruction_text" TEXT,
  ADD COLUMN "draft_hint_text" TEXT,
  ADD COLUMN "draft_text_overrides" JSONB,
  ADD COLUMN "draft_updated_at" TIMESTAMPTZ;
