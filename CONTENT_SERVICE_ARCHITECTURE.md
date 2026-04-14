# Content Service — Architecture Document

This document is the single source of truth for all architectural decisions made during the Content Service design phase. Place it in the repository root alongside `CLAUDE.md`. Claude Code must read this document before working on any Content Service prompt.

## Purpose

Content Service stores all educational materials for the SSZ Platform: courses, lessons, vocabulary lists, grammar rules, exercises. It owns content authoring (CRUD for tutors and schools), versioning, multilingual content variants, visibility/access control, tagging, and content sharing.

It does NOT own: enrollments, progress tracking, SRS state, exercise answer validation. Those live in Learning Service, Practice Service, and Exercise Engine respectively.

## Tech Stack

Same as User Profile Service:
- NestJS + TypeScript
- Clean Architecture (domain → application → infrastructure → presentation)
- Prisma + PostgreSQL (database `content_db`, user `content_service`)
- RabbitMQ for events
- Redis for caching display endpoints
- JWT validation via Auth Service public key
- Swagger via `@nestjs/swagger`
- Pino logging
- CQRS via `@nestjs/cqrs`
- API prefix `/api/v1/`

## Cross-Cutting Decisions

### Authorization
- VisibilityGuard checks every read endpoint (algorithm in section "VisibilityGuard")
- Synchronous calls to Organization Service for school role checks (NO caching)
- Hybrid 403/404 model: catalog queries filter silently, direct ID lookups return 403

### Content ownership
- Every content entity has `owner_user_id` (always) and `owner_school_id` (nullable)
- Personal content: `owner_school_id IS NULL`, owned by individual tutor
- School content: `owner_school_id IS NOT NULL`, owned by school
- Tutor explicitly chooses owner type when creating content
- Creating school content requires `content_admin` or `owner` role in that school
- Content cannot be transferred between owner types after creation

### Visibility levels
Five values for `visibility` enum: `public`, `school_private`, `shared`, `private`.

CHECK constraint per entity:
- If `owner_school_id IS NULL` → visibility ∈ {public, shared, private}
- If `owner_school_id IS NOT NULL` → visibility ∈ {public, school_private, shared, private}

### Access tiers (containers only)
Five values for `access_tier` enum on `containers` table:
- `assigned_only` — only via tutor assignment, students cannot self-enroll
- `entitlement_required` — students can self-enroll if they have an active entitlement
- `free_within_school` — any school member can self-enroll without entitlement
- `public_free` — anyone can self-enroll
- `public_paid` — anyone with active entitlement can self-enroll

Default access_tier on creation:
- `visibility = public` → `public_free`
- All others → `assigned_only`

### Soft delete everywhere
- All entities have `deleted_at` timestamp
- Soft-deleted content blocked from references in published containers
- Hard delete reserved for future cascade scenarios
- Containers retain versions/items after soft delete

### Slugs
- Only for `public` content
- Auto-generated from title at first publication
- Numeric suffix on collisions (`norwegian-for-beginners-2`)
- Immutable after creation
- Slug is NULL for private content

### Metadata localization
- Container titles/descriptions stored in single language (creator's choice)
- Optional `container_localizations` table for translations
- Lesson `title` is admin-only field, any language
- Display titles for students come from variants

## Microservice Boundaries

### Organization Service additions
New role in `school_member_role` enum: `content_admin`. Full enum becomes:
`owner`, `admin`, `teacher`, `student`, `content_admin`

New columns on `schools` table:
- `require_tutor_review_for_self_paced` BOOLEAN DEFAULT FALSE
- `default_explanation_language` VARCHAR(10) NULL

New internal endpoints (service-to-service only, NOT exposed via API gateway):
- `GET /api/v1/internal/schools/{schoolId}/members/{userId}/role`
- `GET /api/v1/internal/schools/members-batch?userIds=...&schoolIds=...`

### Learning Service responsibilities relevant to Content Service
- Listens to `content.container.published` event
- Manages enrollments and version migration
- Cron job (daily) for sunset migration of deprecated container versions
- Calls Content Service to mark deprecated versions as archived after migration

## Block 1: Containers + Versioning

### Concept
Container is an abstract "course idea" with metadata. Each container has multiple versions over time. Items inside a version are an ordered list of references to content units (lessons, vocabulary lists, etc.) or nested containers.

Container lifecycle: draft → published → deprecated → archived

### Tables

#### `containers`
- `id` UUID PK
- `slug` VARCHAR(120) NULL — only for public
- `container_type` ENUM('course', 'module', 'collection') NOT NULL
- `target_language` VARCHAR(10) NOT NULL
- `difficulty_level` ENUM('A1','A2','B1','B2','C1','C2') NOT NULL
- `title` VARCHAR(200) NOT NULL
- `description` TEXT NULL
- `cover_image_media_id` UUID NULL
- `owner_user_id` UUID NOT NULL
- `owner_school_id` UUID NULL
- `visibility` ENUM('public','school_private','shared','private') NOT NULL
- `access_tier` ENUM('assigned_only','entitlement_required','free_within_school','public_free','public_paid') NOT NULL
- `current_published_version_id` UUID NULL FK
- `created_at`, `updated_at`, `deleted_at` TIMESTAMPTZ
- Indexes: unique slug WHERE NOT NULL, (target_language, difficulty_level), owner_user_id, owner_school_id, visibility, (deleted_at, visibility, target_language)
- CHECK constraints on visibility/owner_school_id combinations

#### `container_versions`
- `id` UUID PK
- `container_id` UUID NOT NULL FK
- `version_number` INT NOT NULL
- `status` ENUM('draft','published','deprecated','archived') NOT NULL
- `changelog` TEXT NULL
- `created_at`, `created_by_user_id`
- `published_at`, `published_by_user_id` NULL
- `deprecated_at`, `sunset_at` NULL
- `archived_at` NULL
- `revision_count` INT NOT NULL DEFAULT 0 — for optimistic concurrency on items
- Constraints: UNIQUE(container_id, version_number), partial unique on (container_id) WHERE status='draft', partial unique on (container_id) WHERE status='published'
- Indexes: (status, sunset_at), container_id

#### `container_items`
- `id` UUID PK
- `container_version_id` UUID NOT NULL FK ON DELETE CASCADE
- `position` INT NOT NULL
- `item_type` ENUM('container','lesson','vocabulary_list','grammar_rule','exercise') NOT NULL
- `item_id` UUID NOT NULL — polymorphic FK, no Prisma relation
- `is_required` BOOLEAN NOT NULL DEFAULT TRUE
- `section_label` VARCHAR(100) NULL
- `added_at` TIMESTAMPTZ
- Constraints: UNIQUE(container_version_id, position)
- Indexes: (item_type, item_id), container_version_id

#### `container_localizations`
- `id` UUID PK
- `container_id` UUID NOT NULL FK ON DELETE CASCADE
- `language_code` VARCHAR(10) NOT NULL
- `title` VARCHAR(200) NOT NULL
- `description` TEXT NULL
- `created_at`, `updated_at`, `created_by_user_id`
- Constraints: UNIQUE(container_id, language_code)

### Lifecycle Operations

**Create container:** creates `containers` row + initial `container_versions` (draft, version 1). Container not visible until first publish.

**Edit draft items:** add/update/remove `container_items` only when version status is `draft`. Returns 409 Conflict if version is published/deprecated.

**Publish version:** transaction with `SELECT FOR UPDATE` on container row.
1. Check version status is `draft`
2. If container has `current_published_version_id`:
   - Set old version status to `deprecated`
   - Set `deprecated_at = NOW()`
   - Set `sunset_at = NOW() + sunset_period_days` (default 90, configurable 30-365)
3. Set current version status to `published`, `published_at`, `published_by_user_id`
4. Update `containers.current_published_version_id`
5. If first publication and visibility is public → generate slug
6. Publish event `content.container.published` with `{ container_id, new_version_id, previous_version_id }`

**Create new draft from published:** copies all `container_items` from published version into new draft version. Returns existing draft if one already exists.

**Cancel draft:** DELETE container_version (only allowed for draft status), CASCADE removes items.

**Cron job (in Learning Service, daily):** SELECT versions WHERE status='deprecated' AND sunset_at <= NOW(). For each, migrate enrollments to current published version. After migration, call Content Service to archive the version if no active enrollments remain.

**Validation rules:**
- Cannot publish empty version (must have at least one container_item)
- Cannot publish version with broken references (referenced content was soft-deleted)

### Version Behavior for Students (handled by Learning Service)
- Not started enrollments: auto-switch to new version
- In-progress enrollments: create EnrollmentVersionOffer, student chooses
- Completed enrollments: badge "Updated" in dashboard, no auto-action
- After sunset_at: forced migration via cron, notification sent

### API Endpoints
```
GET    /api/v1/containers
GET    /api/v1/containers/{id}
GET    /api/v1/containers/{id}/versions
GET    /api/v1/containers/{id}/versions/{vid}
GET    /api/v1/containers/by-slug/{slug}
GET    /api/v1/container-versions/{id}/items

POST   /api/v1/containers
PATCH  /api/v1/containers/{id}
DELETE /api/v1/containers/{id}
POST   /api/v1/containers/{id}/draft

POST   /api/v1/container-versions/{vid}/items
PATCH  /api/v1/container-items/{item_id}
DELETE /api/v1/container-items/{item_id}
PATCH  /api/v1/container-versions/{vid}/items/reorder

POST   /api/v1/container-versions/{vid}/publish
DELETE /api/v1/container-versions/{vid}

POST   /api/v1/containers/{id}/localizations
PATCH  /api/v1/containers/{id}/localizations/{lang}
DELETE /api/v1/containers/{id}/localizations/{lang}
```

### Events Published
- `content.container.created`
- `content.container.updated`
- `content.container.published`
- `content.container.deprecated`
- `content.container.archived`
- `content.container.deleted`

## Block 2: Lessons + Content Variants

### Concept
Lesson is a language-neutral entity with metadata. Content lives in `lesson_content_variants`, one per (explanation_language, level_range). Best variant selected at runtime based on student's native language and current level.

### Tables

#### `lessons`
- `id` UUID PK
- `target_language` VARCHAR(10) NOT NULL
- `difficulty_level` ENUM(...) NOT NULL
- `slug` VARCHAR(120) NULL — for public lessons
- `title` VARCHAR(200) NOT NULL — admin-only, any language
- `description` TEXT NULL
- `owner_user_id`, `owner_school_id`, `visibility`
- `cover_image_media_id` UUID NULL
- `created_at`, `updated_at`, `deleted_at`

Note: `estimated_duration_minutes` removed from lessons (only in variants).

#### `lesson_content_variants`
- `id` UUID PK
- `lesson_id` UUID NOT NULL FK ON DELETE CASCADE
- `explanation_language` VARCHAR(10) NOT NULL
- `min_level`, `max_level` ENUM(...) NOT NULL
- `display_title` VARCHAR(200) NOT NULL — title in explanation_language
- `display_description` TEXT NULL
- `body_markdown` TEXT NOT NULL
- `estimated_reading_minutes` INT NULL
- `status` ENUM('draft','published') NOT NULL DEFAULT 'draft'
- `created_at`, `updated_at`, `created_by_user_id`, `last_edited_by_user_id`
- `published_at` TIMESTAMPTZ NULL
- Constraints: UNIQUE(lesson_id, explanation_language, min_level, max_level), CHECK min_level <= max_level

Variants can be edited directly when published (silent updates allowed for typo fixes etc.). No deprecated/archived states for variants.

#### `lesson_variant_media_refs`
Denormalized table extracted from body_markdown for quick reverse lookups.
- `id` UUID PK
- `lesson_content_variant_id` UUID NOT NULL FK ON DELETE CASCADE
- `media_id` UUID NOT NULL
- `media_type` ENUM('image','audio','video') NOT NULL
- `position_in_text` INT NOT NULL
- `extracted_at` TIMESTAMPTZ
- Indexes: lesson_content_variant_id, media_id

### Markdown format
Body uses standard markdown plus custom protocols resolved by frontend:
- `![alt](media://img_a3f9)` — images via Media Service
- `[audio:aud_b7c2 "label"]` — inline audio
- `[video:vid_c5d1]` — inline video

Content Service parses body on save to populate `lesson_variant_media_refs`.

### Best Variant Algorithm
Input: `lesson_id`, `student_native_language`, `student_current_level`, `student_known_languages[]`

1. Load all published variants for lesson
2. Filter by level: variants where student_level ∈ [min_level, max_level]
3. If empty: fallback to variants where min_level <= student_level, take highest
4. If still empty: take any variant (lowest level), mark fallback
5. Among level-matching, choose by language priority:
   a. variant where explanation_language == student_native_language
   b. variant where explanation_language ∈ known_languages (in user preference order)
   c. variant where explanation_language == 'en'
   d. variant where explanation_language == target_language (immersion)
   e. first available
6. Return variant + `fallbackUsed` flag

### API Endpoints
```
GET  /api/v1/lessons
GET  /api/v1/lessons/{id}
GET  /api/v1/lessons/{id}/variants
GET  /api/v1/lessons/{id}/variants/{vid}
GET  /api/v1/lessons/{id}/best-variant?explanationLanguage=ru&studentLevel=A2
GET  /api/v1/lessons/by-slug/{slug}

POST   /api/v1/lessons
PATCH  /api/v1/lessons/{id}
DELETE /api/v1/lessons/{id}

POST   /api/v1/lessons/{id}/variants
PATCH  /api/v1/lessons/{id}/variants/{vid}
POST   /api/v1/lessons/{id}/variants/{vid}/publish
DELETE /api/v1/lessons/{id}/variants/{vid}
```

Frontend passes `explanationLanguage` and `studentLevel` as query params (read from user profile client-side), Content Service does not call User Profile Service for this.

### Soft Delete Rules
DELETE /lessons/{id}:
1. Check no references in container_items where parent version status IN ('published', 'deprecated')
2. If references exist → 409 Conflict with list of containers using this lesson
3. If clean → set deleted_at on lesson and all variants

Draft references don't block deletion but cause publish failure with explicit error.

### Events
- `content.lesson.created`, `updated`, `deleted`
- `content.lesson.variant.created`, `published`

## Block 3: Vocabulary

### Concept
Language-neutral word entities with translations and usage examples per language. Used by Content Service for content authoring and by Practice Service for SRS card display.

### Tables

#### `vocabulary_lists`
- `id` UUID PK
- `slug` VARCHAR(120) NULL — for public
- `title` VARCHAR(200) NOT NULL — admin-only
- `description` TEXT NULL
- `target_language` VARCHAR(10) NOT NULL
- `difficulty_level` ENUM(...) NOT NULL
- `owner_user_id`, `owner_school_id`, `visibility`
- `auto_add_to_srs` BOOLEAN NOT NULL DEFAULT TRUE
- `cover_image_media_id` UUID NULL
- `created_at`, `updated_at`, `deleted_at`

#### `vocabulary_items`
- `id` UUID PK
- `vocabulary_list_id` UUID NOT NULL FK ON DELETE CASCADE
- `word` VARCHAR(200) NOT NULL — case preserved
- `position` INT NOT NULL
- `part_of_speech` ENUM('noun','verb','adjective','adverb','pronoun','preposition','conjunction','interjection','numeral','particle','phrase','other')
- `ipa_transcription` VARCHAR(200) NULL
- `pronunciation_audio_media_id` UUID NULL
- `grammatical_properties` JSONB NULL — flexible per language, validated in code
- `register` ENUM('formal','informal','neutral','colloquial','slang','archaic','dialect') NULL
- `notes` TEXT NULL
- `created_at`, `updated_at`, `deleted_at`
- Constraints: UNIQUE(vocabulary_list_id, position), UNIQUE(vocabulary_list_id, word)

Note: `frequency_rank` is NOT included in initial schema. Add later if needed.

#### `vocabulary_item_translations`
- `id` UUID PK
- `vocabulary_item_id` UUID NOT NULL FK ON DELETE CASCADE
- `translation_language` VARCHAR(10) NOT NULL
- `primary_translation` VARCHAR(300) NOT NULL
- `alternative_translations` TEXT[] NULL
- `definition` TEXT NULL
- `usage_notes` TEXT NULL
- `false_friend_warning` TEXT NULL
- `created_at`, `updated_at`, `created_by_user_id`, `last_edited_by_user_id`
- Constraints: UNIQUE(vocabulary_item_id, translation_language)

Multiple meanings handled via `alternative_translations` and `definition`. For truly distinct meanings, tutors create separate vocabulary_items.

#### `vocabulary_usage_examples`
- `id` UUID PK
- `vocabulary_item_id` UUID NOT NULL FK ON DELETE CASCADE
- `example_text` TEXT NOT NULL
- `position` INT NOT NULL DEFAULT 0
- `audio_media_id` UUID NULL
- `context_note` VARCHAR(200) NULL
- `created_at`, `updated_at`
- Constraints: UNIQUE(vocabulary_item_id, position)

#### `vocabulary_example_translations`
- `id` UUID PK
- `vocabulary_usage_example_id` UUID NOT NULL FK ON DELETE CASCADE
- `translation_language` VARCHAR(10) NOT NULL
- `translated_text` TEXT NOT NULL
- `created_at`, `updated_at`
- Constraints: UNIQUE(vocabulary_usage_example_id, translation_language)

### Display Endpoint (used by Practice Service)
```
GET /api/v1/vocabulary-items/{id}/for-display?translationLanguage=ru&includeExamples=true&examplesLimit=1&examplesRandom=true

POST /api/v1/vocabulary-items/batch-for-display
Body: { vocabularyItemIds: [...], translationLanguage, includeExamples, examplesLimit, examplesRandom }
```

Cached in Redis (TTL 15 min), invalidated on `content.vocabulary_item.updated` event.

### Translation Fallback
Same as lessons: native_language → known_languages → en → no translation (immersion).

### API Endpoints
```
GET  /api/v1/vocabulary-lists
GET  /api/v1/vocabulary-lists/{id}
GET  /api/v1/vocabulary-lists/{id}/items
GET  /api/v1/vocabulary-lists/by-slug/{slug}
GET  /api/v1/vocabulary-items/{id}
GET  /api/v1/vocabulary-items/{id}/for-display
POST /api/v1/vocabulary-items/batch-for-display

POST   /api/v1/vocabulary-lists
PATCH  /api/v1/vocabulary-lists/{id}
DELETE /api/v1/vocabulary-lists/{id}

POST   /api/v1/vocabulary-lists/{id}/items
POST   /api/v1/vocabulary-lists/{id}/items/bulk
PATCH  /api/v1/vocabulary-items/{id}
DELETE /api/v1/vocabulary-items/{id}
PATCH  /api/v1/vocabulary-lists/{id}/items/reorder

POST   /api/v1/vocabulary-items/{id}/translations
PATCH  /api/v1/vocabulary-items/{id}/translations/{lang}
DELETE /api/v1/vocabulary-items/{id}/translations/{lang}

POST   /api/v1/vocabulary-items/{id}/examples
PATCH  /api/v1/vocabulary-items/{id}/examples/{exid}
DELETE /api/v1/vocabulary-items/{id}/examples/{exid}

POST   /api/v1/vocabulary-examples/{exid}/translations
PATCH  /api/v1/vocabulary-examples/{exid}/translations/{lang}
```

### Bulk Import Format
Only JSON. Frontend converts CSV to JSON before sending.

### No Versioning
Vocabulary lists are edited directly. No draft/published flow.

### Events
- `content.vocabulary_list.created`, `updated`, `deleted`
- `content.vocabulary_item.created`, `updated`, `deleted`
- `content.vocabulary_translation.added`

## Block 4: Grammar + Exercises + Templates

### Concept
- ExerciseTemplate: type of exercise with JSON schemas for content/answers (seed data)
- Exercise: concrete instance, validated against template schema
- ExerciseInstruction: localized instructions per exercise
- GrammarRule: language-neutral rule with topic categorization
- GrammarRuleExplanation: localized explanations (variants)
- GrammarRuleExercisePool: many-to-many pool of exercises for FSRS rotation

### Tables

#### `exercise_templates` (seed data)
- `id` UUID PK
- `code` VARCHAR(50) NOT NULL UNIQUE
- `name` VARCHAR(100) NOT NULL
- `description` TEXT NULL
- `content_schema` JSONB NOT NULL
- `answer_schema` JSONB NOT NULL
- `default_check_settings` JSONB NULL
- `supported_languages` VARCHAR(10)[] NULL
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at`

Initial seed: 5 templates
1. `multiple_choice`
2. `fill_in_blank`
3. `translate_to_target`
4. `translate_from_target`
5. `match_pairs`

#### `exercises`
- `id` UUID PK
- `exercise_template_id` UUID NOT NULL FK
- `target_language` VARCHAR(10) NOT NULL
- `difficulty_level` ENUM(...) NOT NULL
- `content` JSONB NOT NULL — validated against template.content_schema
- `expected_answers` JSONB NOT NULL — validated against template.answer_schema
- `answer_check_settings` JSONB NULL — overrides template defaults
- `owner_user_id`, `owner_school_id`, `visibility`
- `estimated_duration_seconds` INT NULL
- `created_at`, `updated_at`, `deleted_at`

#### `exercise_instructions`
- `id` UUID PK
- `exercise_id` UUID NOT NULL FK ON DELETE CASCADE
- `instruction_language` VARCHAR(10) NOT NULL
- `instruction_text` TEXT NOT NULL
- `hint_text` TEXT NULL
- `text_overrides` JSONB NULL — localized strings for inline content references
- `created_at`, `updated_at`
- Constraints: UNIQUE(exercise_id, instruction_language)

`text_overrides` mechanism: content JSONB can contain string keys like `{question: "$$question_text$$"}`. Frontend resolves `$$question_text$$` from `text_overrides` of selected instruction language. This allows localizing the textual parts of exercises while keeping the structure language-neutral.

#### `grammar_rules`
- `id` UUID PK
- `slug` VARCHAR(120) NULL
- `target_language` VARCHAR(10) NOT NULL
- `difficulty_level` ENUM(...) NOT NULL
- `topic` ENUM('verbs','nouns','adjectives','adverbs','pronouns','articles','prepositions','conjunctions','word_order','tenses','cases','mood','voice','numerals','other')
- `subtopic` VARCHAR(100) NULL
- `title` VARCHAR(200) NOT NULL
- `description` TEXT NULL
- `owner_user_id`, `owner_school_id`, `visibility`
- `created_at`, `updated_at`, `deleted_at`

#### `grammar_rule_explanations`
- `id` UUID PK
- `grammar_rule_id` UUID NOT NULL FK ON DELETE CASCADE
- `explanation_language` VARCHAR(10) NOT NULL
- `min_level`, `max_level` ENUM(...) NOT NULL
- `display_title` VARCHAR(200) NOT NULL
- `display_summary` TEXT NULL
- `body_markdown` TEXT NOT NULL
- `estimated_reading_minutes` INT NULL
- `status` ENUM('draft','published') NOT NULL DEFAULT 'draft'
- `created_at`, `updated_at`, `created_by_user_id`, `last_edited_by_user_id`, `published_at`
- Constraints: UNIQUE(grammar_rule_id, explanation_language, min_level, max_level), CHECK min_level <= max_level

#### `grammar_rule_exercise_pool`
- `id` UUID PK
- `grammar_rule_id` UUID NOT NULL FK ON DELETE CASCADE
- `exercise_id` UUID NOT NULL FK ON DELETE CASCADE
- `position` INT NOT NULL
- `weight` FLOAT NOT NULL DEFAULT 1.0
- `added_at`, `added_by_user_id`
- Constraints: UNIQUE(grammar_rule_id, exercise_id)
- Indexes: grammar_rule_id, exercise_id

Exercise can belong to multiple grammar rule pools (many-to-many).

### Display Endpoints
```
GET /api/v1/exercises/{id}/for-display?instructionLanguage=ru
```
Returns exercise without `expected_answers` (security).

```
GET /api/v1/exercises/{id}/with-answers
```
Internal endpoint for Exercise Engine, not exposed via API gateway. Returns full data including answers and check settings.

```
GET /api/v1/grammar-rules/{id}/random-exercise?instructionLanguage=ru&excludeExerciseIds=...
```
Weighted random selection from pool with exclusion list.

### API Endpoints
```
GET  /api/v1/exercise-templates
GET  /api/v1/exercise-templates/{code}

GET    /api/v1/exercises
GET    /api/v1/exercises/{id}
GET    /api/v1/exercises/{id}/for-display
GET    /api/v1/exercises/{id}/with-answers   # internal only
POST   /api/v1/exercises
PATCH  /api/v1/exercises/{id}
DELETE /api/v1/exercises/{id}

POST   /api/v1/exercises/{id}/instructions
PATCH  /api/v1/exercises/{id}/instructions/{lang}
DELETE /api/v1/exercises/{id}/instructions/{lang}

GET    /api/v1/grammar-rules
GET    /api/v1/grammar-rules/{id}
GET    /api/v1/grammar-rules/{id}/explanations
GET    /api/v1/grammar-rules/{id}/explanations/best
GET    /api/v1/grammar-rules/{id}/exercise-pool
GET    /api/v1/grammar-rules/{id}/random-exercise

POST   /api/v1/grammar-rules
PATCH  /api/v1/grammar-rules/{id}
DELETE /api/v1/grammar-rules/{id}

POST   /api/v1/grammar-rules/{id}/explanations
PATCH  /api/v1/grammar-rules/{id}/explanations/{eid}
POST   /api/v1/grammar-rules/{id}/explanations/{eid}/publish
DELETE /api/v1/grammar-rules/{id}/explanations/{eid}

POST   /api/v1/grammar-rules/{id}/exercise-pool
DELETE /api/v1/grammar-rules/{id}/exercise-pool/{exId}
PATCH  /api/v1/grammar-rules/{id}/exercise-pool/reorder
```

### Events
- `content.exercise.created`, `updated`, `deleted`
- `content.grammar_rule.created`, `updated`, `deleted`
- `content.grammar_rule.exercise_pool.changed`

## Block 5: Cross-Cutting (Tags, Shares, Entitlements, VisibilityGuard)

### Tags

#### `tags`
- `id` UUID PK
- `slug` VARCHAR(80) NOT NULL
- `name` VARCHAR(100) NOT NULL
- `category` ENUM('topic','situation','skill','level','other')
- `scope` ENUM('global','school') NOT NULL
- `owner_school_id` UUID NULL
- `created_at`, `created_by_user_id`, `deleted_at`
- Constraints: unique slug per scope, CHECK on scope/owner_school_id consistency

Global tags created by Platform Admin only. School tags by content_admin or owner of that school.

#### `tag_assignments`
- `id` UUID PK
- `tag_id` UUID NOT NULL FK
- `entity_type` ENUM('container','lesson','vocabulary_list','grammar_rule','exercise')
- `entity_id` UUID NOT NULL
- `assigned_at`, `assigned_by_user_id`
- Constraints: UNIQUE(tag_id, entity_type, entity_id)
- Indexes: (entity_type, entity_id), tag_id

### Content Shares

#### `content_shares`
- `id` UUID PK
- `entity_type` ENUM(...)
- `entity_id` UUID NOT NULL
- `shared_with_user_id` UUID NOT NULL
- `shared_by_user_id` UUID NOT NULL
- `permission` ENUM('read','read_and_review') NOT NULL DEFAULT 'read'
- `expires_at` TIMESTAMPTZ NULL
- `revoked_at` TIMESTAMPTZ NULL
- `note` TEXT NULL
- `created_at`
- Constraints: partial unique on (entity_type, entity_id, shared_with_user_id) WHERE revoked_at IS NULL
- Indexes: (shared_with_user_id, revoked_at), (entity_type, entity_id), expires_at (for cleanup cron)

Sharing only allowed for entities with visibility = 'shared'. Daily cron marks expired shares as revoked.

### Entitlements

#### `content_entitlements`
- `id` UUID PK
- `user_id` UUID NOT NULL
- `container_id` UUID NOT NULL FK
- `entitlement_type` ENUM('manual','subscription','one_time_purchase','promotional','free_granted')
- `granted_at`, `expires_at` (NULL = forever), `revoked_at`
- `granted_by_user_id` NULL
- `source_reference` VARCHAR(200) NULL — billing transaction id, subscription id
- `metadata` JSONB NULL
- Constraints: partial unique on (user_id, container_id) WHERE revoked_at IS NULL
- Indexes: (user_id, container_id), (user_id, expires_at), container_id

Manual grant API for now. Future billing service will publish events that grant/revoke entitlements automatically.

### VisibilityGuard Algorithm

```
canAccess(user, entity, action: 'view'|'enroll'|'edit'):

  // 1. Soft-deleted: only owner and platform admin can view
  if entity.deleted_at IS NOT NULL:
    if user.id == entity.owner_user_id and action == 'view': return ALLOWED
    if user.is_platform_admin: return ALLOWED
    return DENIED

  // 2. Platform admin
  if user.is_platform_admin: return ALLOWED

  // 3. Owner
  if user.id == entity.owner_user_id: return ALLOWED

  // 4. School content — check school role
  if entity.owner_school_id IS NOT NULL:
    role = orgService.getMemberRole(user.id, entity.owner_school_id)

    if action == 'edit':
      if role IN ('owner', 'content_admin'): return ALLOWED
      else: return DENIED

    if role IN ('owner', 'content_admin', 'teacher'):
      return ALLOWED  // Non-student school members see all school content

  // 5. Edit allowed only to owners/content_admins (handled above)
  if action == 'edit': return DENIED

  // 6. Visibility-based
  if entity.visibility == 'public':
    if action == 'view': return ALLOWED
    if action == 'enroll': return checkAccessTier(user, entity)

  if entity.visibility == 'school_private':
    if entity.owner_school_id IS NOT NULL:
      role = orgService.getMemberRole(user.id, entity.owner_school_id)
      if role == 'student':
        if action == 'view': return ALLOWED
        if action == 'enroll': return checkAccessTier(user, entity)
    return DENIED

  if entity.visibility == 'shared':
    hasShare = active ContentShare exists for (entity, user)
    if hasShare:
      if action == 'view': return ALLOWED
      if action == 'enroll': return checkAccessTier(user, entity)
    return DENIED

  if entity.visibility == 'private':
    return DENIED  // owner already checked above

  return DENIED


checkAccessTier(user, container):
  switch container.access_tier:
    case 'public_free': return ALLOWED
    case 'free_within_school':
      if container.owner_school_id IS NOT NULL:
        role = orgService.getMemberRole(user.id, container.owner_school_id)
        if role IS NOT NULL: return ALLOWED
      return DENIED
    case 'public_paid', 'entitlement_required':
      hasActive = active ContentEntitlement exists for (user, container)
      if hasActive: return ALLOWED
      return DENIED
    case 'assigned_only':
      return DENIED  // Only Learning Service creates enrollments via assignment
```

### Response Codes
- Catalog endpoints: filter results silently (no error codes for hidden content)
- Direct ID lookup with no access: 403 Forbidden
- Direct ID lookup for non-existent: 404 Not Found

### Implementation as NestJS Guard
```typescript
@RequireAccess('view' | 'enroll' | 'edit')
```
Decorator on endpoints. Guard loads entity by id from request params, runs algorithm, attaches entity to request context for handler reuse.

### API Endpoints (Block 5)
```
GET    /api/v1/tags?scope=global&category=topic
GET    /api/v1/tags?scope=school&schoolId={id}
POST   /api/v1/tags
PATCH  /api/v1/tags/{id}
DELETE /api/v1/tags/{id}

POST   /api/v1/{entityType}/{entityId}/tags
DELETE /api/v1/{entityType}/{entityId}/tags/{tagId}

POST   /api/v1/content-shares
GET    /api/v1/me/shared-with-me
GET    /api/v1/{entityType}/{entityId}/shares
DELETE /api/v1/content-shares/{id}

POST   /api/v1/containers/{id}/entitlements   # manual grant
GET    /api/v1/me/entitlements
DELETE /api/v1/content-entitlements/{id}      # revoke
```

### Events
- `content.tag.created`, `updated`, `deleted`
- `content.shared`, `content.share.revoked`
- `content.entitlement.granted`, `revoked`

## Block 6: Discovery (Search and Filtering)

For initial release, simple WHERE-clause filtering. No full-text search engine. Add Meilisearch/Elasticsearch later if needed.

### Catalog endpoints
All catalog endpoints support:
- `target_language` (often required)
- `difficulty_level`
- `tags[]` — filter by tag IDs
- `search` — ILIKE on title + description
- `owner_school_id` — filter by school
- `visibility` — filter (with VisibilityGuard applied)
- `page`, `limit`
- `sort` — `created_at_desc`, `title_asc`, etc.

Response format:
```json
{
  "items": [...],
  "total": 142,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

### Endpoints
Use existing catalog endpoints from each block:
- `GET /api/v1/containers`
- `GET /api/v1/lessons`
- `GET /api/v1/vocabulary-lists`
- `GET /api/v1/grammar-rules`
- `GET /api/v1/exercises`

No unified search across types in v1. Add later if user feedback demands it.

## Inter-Service Communication Summary

### Events Published by Content Service
All listed in their respective blocks. Naming convention: `content.<entity>.<action>`.

### Events Consumed by Content Service
- `auth.user.deleted` → soft delete user's owned content
- `organization.school.deleted` → soft archive school content
- `organization.member.role.changed` → no action needed (no caching)

### Synchronous Calls Made by Content Service
- Organization Service `/internal/schools/{schoolId}/members/{userId}/role` for VisibilityGuard
- Media Service for validating media_id existence on content save (optional, can be deferred)

### Synchronous Calls to Content Service from Other Services
- Practice Service: `/api/v1/vocabulary-items/batch-for-display`, `/api/v1/exercises/{id}/for-display`, `/api/v1/grammar-rules/{id}/random-exercise`
- Exercise Engine: `/api/v1/exercises/{id}/with-answers`
- Learning Service: container metadata, version info for enrollment migration

## Development Phases (Prompts)

1. **Prompt 1: Foundation** — NestJS skeleton, Prisma, RabbitMQ, Redis, JWT, Swagger, base Clean Architecture structure, health endpoint
2. **Prompt 2: Containers + Versioning** — Block 1 implementation
3. **Prompt 3: Lessons + Content Variants** — Block 2 implementation
4. **Prompt 4: Vocabulary** — Block 3 implementation
5. **Prompt 5: Grammar + Exercises + Templates** — Block 4 implementation
6. **Prompt 6: Cross-Cutting + Discovery** — Block 5 + Block 6 implementation

Each prompt is step-by-step, user installs dependencies manually, Claude Code waits for confirmation between steps.