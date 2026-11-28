-- An exercise with no draft wrote a JSON `null` (not SQL NULL) into its draft columns: the
-- entity mapper used Prisma.JsonNull. Every reader keys on `draft_updated_at`, but the
-- structure tree's title query tested `draft_content` itself, so such a row lost its title
-- to the template name. The mapper now writes SQL NULL; this brings the old rows in line.
-- Only rows without `draft_updated_at` — a row with one holds a real draft and is untouched.
UPDATE "exercises"
SET "draft_content" = NULL,
    "draft_expected_answers" = NULL,
    "draft_answer_check_settings" = NULL
WHERE "draft_updated_at" IS NULL
  AND ("draft_content" IS NOT NULL
       OR "draft_expected_answers" IS NOT NULL
       OR "draft_answer_check_settings" IS NOT NULL);
