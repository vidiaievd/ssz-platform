# Block 6 — Index Review Report

Generated: 2026-04-24  
Scope: `content-service` — all tables accessed by the new catalog and nested-list query handlers.

---

## Methodology

Each catalog handler builds a WHERE clause via `CatalogQueryBuilderService`:

```sql
WHERE deleted_at IS NULL
  AND (visibility = 'PUBLIC'
       OR owner_user_id = $userId
       OR (visibility = 'SCHOOL_PRIVATE' AND id IN (<school-member entity IDs>))  -- Block 7 TODO
       OR (visibility = 'SHARED'         AND id IN (<shared entity IDs>)))
  AND [target_language = ?]           -- optional
  AND [difficulty_level = ?]          -- optional
  AND [(title ILIKE ? OR description ILIKE ?)]  -- optional search
  AND [id IN (<tag-matched entity IDs>)]        -- optional tag filter
ORDER BY <field> <dir>
LIMIT ? OFFSET ?
```

Nested-list handlers use simpler WHERE clauses scoped to a parent FK.

---

## 1. Top-level catalog tables

### 1.1 `containers`

| Column(s) | Index | Used for |
|---|---|---|
| `owner_user_id` | `@@index([ownerUserId])` ✓ | `owner_user_id = $userId` scope arm |
| `owner_school_id` | `@@index([ownerSchoolId])` ✓ | `ownerSchoolId` equality filter |
| `visibility` | `@@index([visibility])` ✓ | `visibility = 'PUBLIC'` arm |
| `target_language, difficulty_level` | `@@index([targetLanguage, difficultyLevel])` ✓ | language + level combo filter |
| `deleted_at, visibility, target_language` | `@@index([deletedAt, visibility, targetLanguage])` ✓ | main catalog composite |
| `container_type` | — | `containerType` equality filter (Block 6 handler) |
| `access_tier` | — | `accessTier` equality filter (Block 6 handler) |
| `title` (ILIKE) | — ⚠ | free-text search |

**Missing / Recommended:**

| Priority | Addition | Reason |
|---|---|---|
| Medium | `@@index([containerType])` | Added as a module-specific AND filter; full scan on large tables otherwise |
| Medium | `@@index([accessTier])` | Same as above |
| Low | GIN trigram on `title` | `title ILIKE '%q%'` cannot use a B-tree index; requires `pg_trgm` extension. Add via raw SQL migration when search volume grows. |

### 1.2 `lessons`

Indexes mirror `containers` (`ownerUserId`, `ownerSchoolId`, `visibility`, `targetLanguage + difficultyLevel`, `deletedAt + visibility + targetLanguage`). All present. ✓

**Missing / Recommended:**

| Priority | Addition | Reason |
|---|---|---|
| Low | GIN trigram on `title` | Same as containers |

### 1.3 `vocabulary_lists`

Indexes identical to `lessons`. All present. ✓

**Missing / Recommended:**

| Priority | Addition | Reason |
|---|---|---|
| Low | GIN trigram on `title` | Same |

### 1.4 `grammar_rules`

Has all standard indexes plus `@@index([topic])` ✓ — covers the module-specific `topic` AND filter.

**Missing / Recommended:**

| Priority | Addition | Reason |
|---|---|---|
| Low | `@@index([topic, deletedAt, visibility])` | If topic-scoped searches are common, a composite avoids index AND-merge; defer until query plans show the need |
| Low | GIN trigram on `title` | Same |

### 1.5 `exercises`

Has all standard indexes plus `@@index([exerciseTemplateId])` ✓.

Note: `Exercise` has no `title` column — search is correctly skipped in `GetExercisesHandler`.

**Missing / Recommended:**

| Priority | Addition | Reason |
|---|---|---|
| Low | `@@index([estimatedDurationSeconds])` | `estimatedDurationMin/Max` range filter; add once usage patterns are known |

---

## 2. Nested-list tables

### 2.1 `container_versions`

Query: `WHERE container_id = ? [AND status = ?] ORDER BY version_number|created_at`

| Column(s) | Index | Status |
|---|---|---|
| `container_id` | `@@index([containerId])` ✓ | Covers parent FK lookup |
| `container_id, version_number` | `@@unique([containerId, versionNumber])` ✓ | Covers `ORDER BY versionNumber` efficiently |
| `status, sunset_at` | `@@index([status, sunsetAt])` ✓ | Existing operational index |
| `container_id, status` | — ⚠ | Combined filter |

**Missing / Recommended:**

| Priority | Addition | Reason |
|---|---|---|
| **High** | `@@index([containerId, status])` | `WHERE container_id = ? AND status = ?` can use neither the single-column FK index nor the `(status, sunset_at)` index efficiently for the combined predicate |

**Proposed schema change:**
```prisma
model ContainerVersion {
  // existing fields ...
  @@index([containerId, status])  // ADD
}
```

### 2.2 `lesson_content_variants`

Query: `WHERE lesson_id = ? AND deleted_at IS NULL [AND status = ?] [AND explanation_language = ?]`

| Column(s) | Index | Status |
|---|---|---|
| `lesson_id` | `@@index([lessonId])` ✓ | Parent FK lookup |
| `lesson_id, status` | `@@index([lessonId, status])` ✓ | Status filter |
| `lesson_id, explanation_language` | — ⚠ | Language filter |
| `lesson_id, deleted_at` | — | `deletedAt IS NULL` on variants (parent-cascade, rarely non-null) |

**Missing / Recommended:**

| Priority | Addition | Reason |
|---|---|---|
| Medium | `@@index([lessonId, explanationLanguage])` | `explanationLanguage` filter is expected to be a common student-facing request (pick content in their language) |

**Proposed schema change:**
```prisma
model LessonContentVariant {
  // existing fields ...
  @@index([lessonId, explanationLanguage])  // ADD
}
```

### 2.3 `grammar_rule_explanations`

Identical query pattern to `lesson_content_variants`.

| Column(s) | Index | Status |
|---|---|---|
| `grammar_rule_id` | `@@index([grammarRuleId])` ✓ | Parent FK lookup |
| `grammar_rule_id, status` | `@@index([grammarRuleId, status])` ✓ | Status filter |
| `grammar_rule_id, explanation_language` | — ⚠ | Language filter |

**Missing / Recommended:**

| Priority | Addition | Reason |
|---|---|---|
| Medium | `@@index([grammarRuleId, explanationLanguage])` | Same reasoning as `lesson_content_variants` |

**Proposed schema change:**
```prisma
model GrammarRuleExplanation {
  // existing fields ...
  @@index([grammarRuleId, explanationLanguage])  // ADD
}
```

### 2.4 `grammar_rule_exercise_pool`

Query: `WHERE grammar_rule_id = ? AND exercise.deleted_at IS NULL ORDER BY position|weight|added_at`

| Column(s) | Index | Status |
|---|---|---|
| `grammar_rule_id` | `@@index([grammarRuleId])` ✓ | Parent FK lookup |
| `grammar_rule_id, exercise_id` | `@@unique([grammarRuleId, exerciseId])` ✓ | Unique constraint (implicit index) |
| `grammar_rule_id, position` | — ⚠ | Sort by position |
| `exercise_id` | `@@index([exerciseId])` ✓ | JOIN to filter `exercise.deleted_at IS NULL` |

**Missing / Recommended:**

| Priority | Addition | Reason |
|---|---|---|
| Medium | `@@index([grammarRuleId, position])` | `ORDER BY position` on a scoped result set; without it the DB sorts in memory after the FK scan. Pool sizes are bounded but can reach ~100 entries. |

**Proposed schema change:**
```prisma
model GrammarRuleExercisePool {
  // existing fields ...
  @@index([grammarRuleId, position])  // ADD
}
```

---

## 3. Supporting tables

### 3.1 `tag_assignments`

Used by `CatalogQueryBuilderService` for the tag-ID pre-query:
```sql
WHERE entity_type = ? AND tag_id IN (?)
```

| Column(s) | Index | Status |
|---|---|---|
| `entity_type, entity_id` | `@@index([entityType, entityId])` ✓ | Reverse lookup |
| `tag_id` | `@@index([tagId])` ✓ | Tag IN filter |
| `tag_id, entity_type, entity_id` | `@@unique([tagId, entityType, entityId])` ✓ | Covers both predicates together |

All queries are fully covered. ✓

### 3.2 `content_shares`

Used by `CatalogQueryBuilderService` for the SHARED visibility pre-query:
```sql
WHERE entity_type = ? AND shared_with_user_id = ? AND revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > NOW())
```

| Column(s) | Index | Status |
|---|---|---|
| `shared_with_user_id, revoked_at` | `@@index([sharedWithUserId, revokedAt])` ✓ | Main filter |
| `entity_type, entity_id` | `@@index([entityType, entityId])` ✓ | Reverse lookup |
| `expires_at` | `@@index([expiresAt])` ✓ | Expiry filter |

All queries are fully covered. ✓

---

## 4. Action summary

| Priority | Table | Change | When |
|---|---|---|---|
| **High** | `container_versions` | Add `@@index([containerId, status])` | Next schema migration |
| Medium | `lesson_content_variants` | Add `@@index([lessonId, explanationLanguage])` | Next schema migration |
| Medium | `grammar_rule_explanations` | Add `@@index([grammarRuleId, explanationLanguage])` | Next schema migration |
| Medium | `grammar_rule_exercise_pool` | Add `@@index([grammarRuleId, position])` | Next schema migration |
| Medium | `containers` | Add `@@index([containerType])`, `@@index([accessTier])` | Next schema migration |
| Low | `exercises` | Add `@@index([estimatedDurationSeconds])` | After load testing |
| Low | All content tables | GIN trigram on `title` (raw SQL migration, requires `pg_trgm`) | Before full-text search goes to production |

No indexes added in Block 6 itself — these are recommendations for the next migration batch.
