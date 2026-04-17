-- ─── Partial unique index: grammar_rules.slug ────────────────────────────────
-- NULL slugs (private/unpublished rules) and soft-deleted rules are excluded.
-- Matches the same pattern used for containers, lessons, and vocabulary_lists.

CREATE UNIQUE INDEX idx_grammar_rules_unique_active_slug
  ON grammar_rules (slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- ─── CHECK constraints: visibility vs ownership on grammar_rules ──────────────
-- Personal content (owner_school_id IS NULL): school_private is not valid.

ALTER TABLE grammar_rules
  ADD CONSTRAINT chk_grammar_rules_visibility_personal_owner
    CHECK (
      owner_school_id IS NOT NULL
      OR visibility::text IN ('public', 'shared', 'private')
    );

-- School content: all four visibility values are valid.

ALTER TABLE grammar_rules
  ADD CONSTRAINT chk_grammar_rules_visibility_school_owner
    CHECK (
      owner_school_id IS NULL
      OR visibility::text IN ('public', 'school_private', 'shared', 'private')
    );

-- ─── CHECK constraints: visibility vs ownership on exercises ──────────────────

ALTER TABLE exercises
  ADD CONSTRAINT chk_exercises_visibility_personal_owner
    CHECK (
      owner_school_id IS NOT NULL
      OR visibility::text IN ('public', 'shared', 'private')
    );

ALTER TABLE exercises
  ADD CONSTRAINT chk_exercises_visibility_school_owner
    CHECK (
      owner_school_id IS NULL
      OR visibility::text IN ('public', 'school_private', 'shared', 'private')
    );

-- ─── CHECK constraint: min_level <= max_level on grammar_rule_explanations ────
-- PostgreSQL enums are not directly comparable by ordinal, so we use a CASE
-- mapping — same approach as lesson_content_variants.

ALTER TABLE grammar_rule_explanations
  ADD CONSTRAINT chk_grammar_rule_explanations_level_range
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

-- ─── CHECK constraint: weight > 0 on grammar_rule_exercise_pool ───────────────

ALTER TABLE grammar_rule_exercise_pool
  ADD CONSTRAINT chk_grammar_rule_exercise_pool_weight_positive
    CHECK (weight > 0);
