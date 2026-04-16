-- ─── Partial unique index: lessons.slug ─────────────────────────────────────
-- NULL slugs (private/unpublished lessons) and soft-deleted lessons are excluded.
-- Matches the same pattern used for containers.

CREATE UNIQUE INDEX idx_lessons_unique_active_slug
  ON lessons (slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- ─── CHECK constraints: visibility vs ownership on lessons ────────────────────
-- Personal content (owner_school_id IS NULL): school_private is not a valid value.

ALTER TABLE lessons
  ADD CONSTRAINT chk_lessons_visibility_personal_owner
    CHECK (
      owner_school_id IS NOT NULL
      OR visibility::text IN ('public', 'shared', 'private')
    );

-- School content: all four visibility values are valid.

ALTER TABLE lessons
  ADD CONSTRAINT chk_lessons_visibility_school_owner
    CHECK (
      owner_school_id IS NULL
      OR visibility::text IN ('public', 'school_private', 'shared', 'private')
    );

-- ─── CHECK constraint: min_level <= max_level on lesson_content_variants ──────
-- PostgreSQL enums are not directly comparable by ordinal value, so we map each
-- difficulty_level member to an integer with a CASE expression (A1=1 … C2=6).

ALTER TABLE lesson_content_variants
  ADD CONSTRAINT chk_lesson_variants_level_range
    CHECK (
      CASE min_level
        WHEN 'A1' THEN 1
        WHEN 'A2' THEN 2
        WHEN 'B1' THEN 3
        WHEN 'B2' THEN 4
        WHEN 'C1' THEN 5
        WHEN 'C2' THEN 6
      END
      <=
      CASE max_level
        WHEN 'A1' THEN 1
        WHEN 'A2' THEN 2
        WHEN 'B1' THEN 3
        WHEN 'B2' THEN 4
        WHEN 'C1' THEN 5
        WHEN 'C2' THEN 6
      END
    );
