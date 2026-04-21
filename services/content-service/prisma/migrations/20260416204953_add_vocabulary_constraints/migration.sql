-- Add vocabulary-specific constraints that Prisma cannot express natively.

-- ── Partial unique index on vocabulary_lists.slug ───────────────────────────
-- Allows multiple NULL slugs (private lists) but enforces uniqueness among
-- non-null slugs that belong to non-deleted lists.
CREATE UNIQUE INDEX "vocabulary_lists_slug_unique"
  ON "vocabulary_lists" ("slug")
  WHERE "slug" IS NOT NULL AND "deleted_at" IS NULL;

-- ── Visibility check: personal content (owner_school_id IS NULL) ─────────────
-- Personal lists may only use public, shared, or private visibility.
ALTER TABLE "vocabulary_lists"
  ADD CONSTRAINT "vocabulary_lists_personal_visibility_check"
  CHECK (
    "owner_school_id" IS NOT NULL
    OR "visibility" IN ('public', 'shared', 'private')
  );

-- ── Visibility check: school content (owner_school_id IS NOT NULL) ───────────
-- School lists may use public, school_private, shared, or private visibility.
ALTER TABLE "vocabulary_lists"
  ADD CONSTRAINT "vocabulary_lists_school_visibility_check"
  CHECK (
    "owner_school_id" IS NULL
    OR "visibility" IN ('public', 'school_private', 'shared', 'private')
  );

-- ── Non-empty word check ─────────────────────────────────────────────────────
-- Reject words that are empty or whitespace-only at the DB level as a last line
-- of defence (primary validation happens in the domain entity).
ALTER TABLE "vocabulary_items"
  ADD CONSTRAINT "vocabulary_items_word_not_blank_check"
  CHECK (length(trim("word")) > 0);
