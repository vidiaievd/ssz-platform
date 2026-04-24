# Content Service — Status

**Stack**: NestJS / TypeScript, Clean Architecture, CQRS
**Database**: `content_db` (PostgreSQL)
**Status**: Complete — Blocks 1–6

---

## Blocks Completed

| Block | Scope | Status |
|-------|-------|--------|
| 1 | Containers & Versioning | Complete |
| 2 | Lessons & Multilingual Variants | Complete |
| 3 | Vocabulary | Complete |
| 4 | Grammar Rules & Exercises | Complete |
| 5 | Tags, Content Shares, Entitlements | Complete |
| 6 | Discovery & Access Control | Complete |

---

## Block 1 — Containers & Versioning

**Module**: `container`

Containers represent top-level content structures: `COURSE`, `MODULE`, `COLLECTION`.

### Version lifecycle
```
draft → published → deprecated → archived
```
Operations: `PublishVersion`, `CancelDraft`, `ArchiveVersion`, `CreateDraftFromPublished`

### Commands (20)
`CreateContainer`, `UpdateContainer`, `DeleteContainer`, `PublishVersion`, `CancelDraft`, `ArchiveVersion`, `CreateDraftFromPublished`, `AddContainerItem`, `RemoveContainerItem`, `UpdateContainerItem`, `ReorderContainerItems`, `CreateLocalization`, `UpdateLocalization`, `DeleteLocalization`, and others.

### Queries (12)
`GetContainer`, `GetContainers`, `GetContainerBySlug`, `GetContainerVersion`, `GetContainerVersions`, `GetVersionItems`, pagination and filtering variants.

### Features
- Localizations: per-version multilingual title/description
- Item management: add, remove, reorder items in a version
- Optimistic concurrency via `revision_count`
- Soft delete with cascade logic

---

## Block 2 — Lessons & Multilingual Variants

**Module**: `lesson`

**Domain entities**: `Lesson`, `LessonContentVariant`

A `Lesson` is a language-neutral metadata record. Actual content lives in `LessonContentVariant` records, each targeting a specific explanation language and learner level range.

### Variant status
`DRAFT` → `PUBLISHED`

### Features
- Markdown content with extracted media references (images, audio, video) stored in `lesson_variant_media_refs`
- `BestVariantSelectorService` — selects optimal variant for a user by comparing level and preferred explanation language
- Commands: `CreateLesson`, `UpdateLesson`, `DeleteLesson`, `PublishVariant`, `UnpublishVariant`
- Queries: `GetLesson`, `GetLessonBySlug`, `GetVariant`, `ListVariants`

---

## Block 3 — Vocabulary

**Module**: `vocabulary`

### Entities
- **`VocabularyList`** — named collection with visibility settings
- **`VocabularyItem`** — word/phrase with part of speech, IPA pronunciation, grammatical properties (JSONB), register, auto-SRS flag
- **`VocabularyItemTranslation`** — per-language translation with definition, usage notes, false friend warnings
- **`VocabularyUsageExample`** — example sentence with audio, context notes
- **`VocabularyExampleTranslation`** — translated example sentences

### Value objects
`Translation`, `Pronunciation`

### Domain services
- `TranslationFallbackSelector` — picks best available translation for a user's language
- `GrammaticalPropertiesValidator` — validates JSONB grammatical properties against part-of-speech rules

### Commands (12+)
Vocabulary list CRUD, item management, translation management, usage example management.

### Queries (7+)
List queries with pagination/filtering, lookup by ID/slug, cache-backed discovery.

### Infrastructure
5 Prisma repositories with mappers. Redis caching for display endpoints.

---

## Block 4 — Grammar Rules & Exercises

**Modules**: `grammar-rule`, `exercise-template`, `exercise`

### Grammar Rules
- **`GrammarRule`** — language-neutral rule with topic category
- **`GrammarRuleExplanation`** — per-language, per-level explanation variant
- Topics: `VERBS`, `NOUNS`, `ADJECTIVES`, `TENSES`, `CASES`, and others

### Exercise Templates
Read-only seed data defining JSON schemas for exercise types:
- `content_schema` — JSON Schema for exercise content validation
- `answer_schema` — JSON Schema for answer validation
- `defaultCheckSettings` — per-template scoring rules
- `supportedLanguages` — nullable array of BCP-47 tags (`null` = all languages)

Templates are seeded at startup and never modified via API.

### Exercises
- **`Exercise`** — instance of a template with JSON content and expected answers
- **`ExerciseInstruction`** — per-language instructions and hint text
- `GrammarRuleExercisePool` — many-to-many linking grammar rules to exercises (weighted random selection)
- Exercise content validated against template's `content_schema` at creation

### Commands
`CreateExercise`, `UpdateExercise`, `DeleteExercise`, `UpsertInstructions`
`CreateGrammarRule`, `UpdateGrammarRule`, `DeleteGrammarRule`, `PublishExplanation`, etc.

### Queries
`GetExercise`, `ListExercises`, `GetGrammarRule`, `GetGrammarRuleBySlug`, `GetExplanations`, `ListTemplates`, `GetTemplate`

---

## Block 5 — Tags, Content Shares, Entitlements

**Modules**: `tag`, `content-share`, `entitlement`

### Tags
- **`Tag`** — scoped as `GLOBAL` (platform_admin) or `SCHOOL` (school content_admin)
- **`TagCategory`** — `TOPIC`, `SITUATION`, `SKILL`, `LEVEL`, `OTHER`
- **`TagAssignment`** — polymorphic: targets `CONTAINER`, `LESSON`, `VOCABULARY_LIST`, `GRAMMAR_RULE`, or `EXERCISE`
- `TagSlugGeneratorService` — auto-generates slugs with collision avoidance

### Content Shares
- **`ContentShare`** — grants a specific user read access to content
- Permissions: `READ` | `READ_AND_REVIEW`
- Optional `expires_at` and `revoke_at` (soft revocation)
- Commands: `CreateContentShare`, `RevokeShare`, `UpdateShare`
- Queries: `GetShares`, `CheckShareAccess`

### Entitlements
- **`ContentEntitlement`** — records a user's right to access content
- Types: `MANUAL`, `SUBSCRIPTION`, `ONE_TIME_PURCHASE`, `PROMOTIONAL`, `FREE_GRANTED`
- Optional expiration and revocation
- Commands: `GrantEntitlement`, `RevokeEntitlement`
- Queries: `CheckEntitlement`, `ListEntitlements`

---

## Block 6 — Discovery & Access Control

**Module**: `shared/access-control`, `shared/discovery`

### Visibility model

| Visibility | Who can read |
|------------|-------------|
| `PUBLIC` | Anyone (no auth required) |
| `SCHOOL_PRIVATE` | School members only |
| `SHARED` | Users with a `ContentShare` grant |
| `PRIVATE` | Owner only |

### Access tiers (containers)

| Tier | Access rule |
|------|------------|
| `ASSIGNED_ONLY` | Tutor must assign; no self-enroll |
| `ENTITLEMENT_REQUIRED` | Self-enroll with valid entitlement |
| `FREE_WITHIN_SCHOOL` | School members get free access |
| `PUBLIC_FREE` | Anyone, no entitlement needed |
| `PUBLIC_PAID` | Anyone with a valid entitlement |

### Components
- **`VisibilityGuard`** — enforces visibility rules on all read endpoints via `@RequireAccess` decorator
- **`CatalogQueryBuilder`** — constructs visibility-aware Prisma queries (catalog = silent filter; direct lookup = 403)
- **`EntitlementLookup`**, **`ContentShareLookup`** — rapid in-request access checks
- **`HttpOrganizationClient`** — calls Organization Service internal API to resolve school roles
- **`@RequireAccess` decorator** — integrated on ALL controller read endpoints

### 403 vs 404 strategy
- **Catalog / list endpoints**: non-visible items are silently filtered out (no 403 leak)
- **Direct lookup endpoints**: non-visible items return `403 Forbidden`

---

## Shared Infrastructure (within Content Service)

| Component | Location | Purpose |
|-----------|----------|---------|
| `Result<T, E>` | `shared/kernel/result.ts` | Functional business error handling |
| `AggregateRoot` | `shared/domain/` | Base class for domain entities with event collection |
| `IEventPublisher` | `shared/application/ports/` | RabbitMQ publish port |
| `ICacheService` | `shared/application/ports/` | Redis cache port |
| `PaginationService` | `shared/discovery/` | Cursor/offset pagination helpers |
| `CatalogQueryBuilder` | `shared/discovery/` | Visibility-aware query construction |
| `MarkdownMediaParser` | `shared/utils/` | Extracts media refs from markdown content |
| `SlugUtil` | `shared/utils/` | Slug generation from titles |
| `@ApiPaginatedResponse` | `shared/discovery/presentation/` | Reusable Swagger pagination decorator |

---

## Database Schema (25+ tables)

### Containers
`containers`, `container_versions`, `container_items`, `container_localizations`

### Lessons
`lessons`, `lesson_content_variants`, `lesson_variant_media_refs`

### Vocabulary
`vocabulary_lists`, `vocabulary_items`, `vocabulary_item_translations`, `vocabulary_usage_examples`, `vocabulary_example_translations`

### Grammar & Exercises
`grammar_rules`, `grammar_rule_explanations`, `grammar_rule_exercise_pool`, `exercise_templates`, `exercises`, `exercise_instructions`

### Cross-cutting
`tags`, `tag_assignments`, `content_shares`, `content_entitlements`

### Enums (partial list)
`ContainerType`, `DifficultyLevel`, `Visibility`, `AccessTier`, `VersionStatus`, `ContainerItemType`, `VariantStatus`, `MediaRefType`, `PartOfSpeech`, `Register`, `GrammarTopic`, `TagCategory`, `TagScope`, `TaggableEntityType`, `SharePermission`, `EntitlementType`

---

## Tests

22 spec files:
- Best variant selector algorithm
- Visibility checker service
- Catalog query builder
- Tag slug generation
- Translation fallback selection
- Grammatical properties validation
- Markdown media extraction
- Pagination, sorting, filtering utilities
- Command handlers: `CreateTag`, `AssignTag`, `GrantEntitlement`, `RevokeEntitlement`, `ContentShare`
- HTTP organization client

---

## Known Gaps

- No full-text search for content discovery
- No batch tag assignment endpoint
- No bulk vocabulary import
- Media reference integrity checking — S3 URLs stored but not validated (Media Service not yet built)
- Learning Service integration — containers/lessons ready to be assigned, but assignment records live in Learning Service (not yet built)
- No content versioning conflict resolution UI (backend concurrency control via `revision_count` is in place)
