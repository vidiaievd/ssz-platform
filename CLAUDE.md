# SSZ Platform — CLAUDE.md

## Overview

EdTech platform for private tutors and language schools providing tools to create learning materials, and for students — tools for studying, training, and memorization of foreign languages.

## Tech Stack

- **Auth Service**: C# / ASP.NET Core 8, Clean Architecture, MediatR CQRS
- **All other microservices**: NestJS (TypeScript)
- **Databases**: PostgreSQL (database-per-service pattern)
- **Message broker**: RabbitMQ (event-driven communication)
- **Cache**: Redis (rate limiting, OTP replay protection, SRS queues, sessions)
- **API Gateway**: nginx
- **Mobile app**: React Native 0.84 (VoxOrd)
- **Containerization**: Docker / Docker Compose
- **Branching strategy**: Git Flow with PRs

## Architecture Standard — Clean Architecture for all NestJS services

All NestJS microservices follow Clean Architecture (Hexagonal / Ports & Adapters) to maintain consistency with the C# Auth Service and ensure long-term maintainability.

### Layers

1. **Domain** — pure business logic, no external dependencies
   - Entities (plain classes, no ORM decorators)
   - Value objects
   - Domain events
   - Repository interfaces
   - Domain exceptions

2. **Application** — business use cases orchestration
   - Use cases / command handlers / query handlers (CQRS via `@nestjs/cqrs`)
   - Application DTOs
   - Port interfaces for external systems (IEventPublisher, ICacheService)

3. **Infrastructure** — concrete implementations
   - Prisma repositories (implement domain interfaces)
   - RabbitMQ publishers / consumers
   - Redis cache service
   - JWT verifier
   - Mappers between Prisma models and domain entities

4. **Presentation** — entry points
   - HTTP controllers
   - Request / Response DTOs with Swagger decorators
   - Guards, filters, interceptors
   - Event handlers (RabbitMQ message controllers)

### Key Principles

- **Dependency Inversion**: Controllers and use cases depend on interfaces (domain layer), not concrete implementations. Implementations injected via DI tokens (Symbols).
- **CQRS**: Use `@nestjs/cqrs` for all mutations. Commands for writes, Queries for reads. Mirrors MediatR pattern from C# Auth Service.
- **Domain Events**: Entities raise events internally. After successful persistence, events published to RabbitMQ via event publisher.
- **Persistence mapping**: Prisma models never leave infrastructure layer. Domain entities are pure. Mappers convert between them.
- **Result pattern**: Use cases return `Result<T, DomainError>` for business errors. Exceptions only for infrastructure failures.

### Standard Folder Structure (per NestJS service)

```
service-name/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── modules/
│   │   └── <feature>/
│   │       ├── domain/
│   │       │   ├── entities/
│   │       │   ├── value-objects/
│   │       │   ├── events/
│   │       │   ├── repositories/     # interfaces only
│   │       │   └── exceptions/
│   │       ├── application/
│   │       │   ├── commands/
│   │       │   ├── queries/
│   │       │   └── dto/
│   │       ├── infrastructure/
│   │       │   ├── persistence/      # Prisma repos + mappers
│   │       │   └── events/
│   │       ├── presentation/
│   │       │   ├── controllers/
│   │       │   └── dto/              # request/response DTOs
│   │       └── <feature>.module.ts
│   ├── shared/
│   │   ├── domain/                   # base entity, aggregate root, domain event interface
│   │   ├── application/ports/        # shared port interfaces
│   │   └── kernel/                   # Result type, etc.
│   ├── common/
│   │   ├── guards/
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── interceptors/
│   │   └── pipes/
│   ├── infrastructure/
│   │   ├── database/                 # Prisma module + service
│   │   ├── messaging/                # RabbitMQ module
│   │   ├── cache/                    # Redis module
│   │   └── auth/                     # JWT verifier
│   ├── config/
│   ├── app.module.ts
│   └── main.ts
└── test/
    ├── unit/
    └── e2e/
```

### When to use simplified structure

For very small services (Notification, Media) Clean Architecture may be overkill. Acceptable simplification: `modules → services → repositories` without domain/application split. Decision made per-service.

## Microservices

### 1. Auth Service (C# — exists)
Registration, login, MFA/TOTP, JWT RS256 (RSA-4096), refresh tokens, session revocation.
Argon2id password hashing, AES-256-GCM encryption, Serilog logging.
Roles: `student`, `tutor`, `school_admin`, `platform_admin`.
Database: `auth_db`

### 2. User Profile Service (NestJS)
User profiles separated from auth. Student profiles (level, target language, progress summary),
tutor profiles (qualifications, languages, schedule).
Follows Clean Architecture.
Database: `profiles_db`

### 3. Organization Service (NestJS)
Schools as entities: creation, teacher invitations, groups/classes management.
Internal roles (owner, admin, teacher). School subscriptions and plans.
AI pre-check setting (`ai-precheck`, plan 84): `enabled`, `perExerciseLimit`, `perLearnerMonthlyCredits`
(`null` = no limit); `GET/PUT /api/v1/schools/:id/ai-precheck`; internal read `GET internal/schools/:id/ai-precheck`.
Follows Clean Architecture.
Database: `organizations_db`

### 4. Content Service (NestJS)
Learning material management: courses → modules → lessons → exercises.
Follows Clean Architecture.
Database: `content_db`
Grammar atom catalog (plan 85): `GET internal/courses/:courseId/grammar-atom-catalog?language=` (`x-internal-token`,
Redis 10 min per course + language). Atoms have no translations; `ruleTitle` only is localised.
Sound atoms (plan 86): natural keys `nb:kj`, catalogue + articulation base per locale (en/nb/ru/uk) —
`GET internal/sound-atoms?language=&locale=` (`x-internal-token`, Redis 10 min); the learner's card of a sound
`GET sound-atoms/:atomId?locale=` (JWT, a slice of the same cached catalogue; region dropped, unknown locale → `en`).
Sound drill (plan 86, step 13.2): `GET internal/sound-atoms/drill?language=&atomIds=` (`x-internal-token`, Redis 10 min
per language) — carrier words and length/toneme pairs that have a reference clip (`sound_reference_clips`), the course's
short lines with their carrier words, one cold-start word per scored family. Data `prisma/data/sound-atom-drill.ts`,
checked against the lexicon and phrases picked by `prisma/tools/sound-drill.ts`.
Reference clips (step 13.2c): `prisma/tools/reference-sound-atoms.ts` asks media-service for every drill word and writes
`sound_reference_clips` (clip or refusal; 503 left for the next run; one word at a time — Azure F0 answers bursts with 429).

### 5. Learning Service (NestJS)
Material assignment, progress tracking, SRS, adaptive review queue.
Follows Clean Architecture.
Database: `learning_db`
Consumes `exercise.feedback.atoms_flagged` (plan 85; queue `learning-service.atoms-flagged`, `processed_events`) and
applies it to `GRAMMAR_ATOM` cards: `ai_precheck` / `ai_review` pull `dueAt` to at most +1 day, no FSRS rating;
`teacher` outside the exercise targets → one `AGAIN` (lapse); table `atom_flags` dedups by (learner, exercise, atom,
source, UTC day). Internal: `GET internal/learners/:userId/grammar-atoms?courseId=` (`x-service-token`).
Learner adds a reached atom: `POST srs/atoms/:atomId/add { courseId }` (shadow card until plan 63 phase 7).

### 6. Exercise Engine Service (NestJS)
Exercise generation and validation, scoring logic, LLM integration.
Follows Clean Architecture.
Database: `exercises_db`
Publishes `exercise.feedback.atoms_flagged` (plan 85; direct publish after the write, no outbox, broker failure only logged)
with sources `ai_precheck` (from `check`), `ai_review` (draft remarks the teacher took or rewrote) and `teacher` (the
teacher's own rule mark on a verdict, `flaggedAtoms`). `POST …/check` also returns `courseId`.
Pronunciation session (plan 86, step 13.4; probe of the engine-owned template `sound_session`, plan on the probe,
state in `attempts.session_state`): `POST sound-sessions { language, atomId? }` (start or resume), `GET sound-sessions/:id/items?locale=`
(step + reference clip links + base instruction), `POST …/takes { recordingAssetId, takeIndex }` (judged by ai-service
`sentence-checks` target / `toneme-checks`; the take is deleted once heard), `POST …/submit` (submission = the stored state).
Its `attempt.completed` (step 13.5a) carries one `gapResults` entry per rated sound — key = `atomId`, target `sound`/`focus`,
`score` 90 / 70 / 0 for GOOD / HARD / AGAIN (Q28) — and no exercise-level target; learning rates shadow `SOUND_ATOM`
cards by the gap's `score`. Kernel row `sound_session` `{ GOOD, AGAIN }` + `ratesAtomsItself`: the probe's `production`
modality does not lift the lapse to HARD.

### 7. Media Service (NestJS)
Upload, storage, processing of media files. S3-compatible storage.
Simplified structure acceptable.
Database: `media_db`
Reference clips of words (plan 88): `POST media/pronunciation/reference` (authors) and
`POST internal/media/pronunciation/reference` (`x-internal-token`, plan 86 step 13.2c — drill scripts); refusals are 422
with the code as `message`, `NOT_AVAILABLE` / `SYNTHESIS_FAILED` are 503.
`POST internal/media/assets/:assetId/discard { ownerId }` (`x-internal-token`) — the engine deletes a pronunciation
session's take once it is measured (plan 86, step 13.4d).

### 8. Notification Service (NestJS)
Push (FCM), email, in-app notifications. Study reminders.
Simplified structure acceptable.
Database: `notifications_db`

### 9. Analytics Service (NestJS)
Analytics for schools/tutors and students. Aggregation, reports, export.
Follows Clean Architecture.
Database: `analytics_db`
Weak grammar rules (plan 85): consumes `exercise.feedback.atoms_flagged` into `weak_rules_daily` (facts keyed by
day, learner, exercise, atom, source). `GET analytics/groups/:groupId/weak-rules?window=7|30|course` and
`GET analytics/students/:studentId/weak-rules?window=&courseId=`; learners selected by group membership + course, not by `group_id`.

### 10. API Gateway (nginx — exists)
Request routing, rate limiting, CORS, SSL termination.

### 11. API Docs Service (static + nginx)
Aggregated Swagger UI for all microservices via multi-spec dropdown.
Reads OpenAPI JSON from each service and displays them in a unified UI.

### 12. AI Service (NestJS)
The only path from the platform to an LLM (plan 77, umbrella plan 48). Registry of providers,
models and prices; adapters `anthropic`, `openai` / `openai_compatible` / `azure_openai`, `google`
and `fake` (dev/tests); agent → model bindings with a fallback and a per-model circuit breaker;
access gate (payer policy, regions, entitlements, quotas); call ledger with cost in credits.
Agents call the gateway, never a provider directly. Provider keys live only here
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `AZURE_OPENAI_API_KEY`, `AZURE_SPEECH_KEY`; the registry
names the variable per provider).
Agent `review_draft` (plan 79): consumes `exercise.attempt.routed_for_review`, reads the submission
beside its key from exercise-engine (`GET /api/v1/internal/attempts/:id/ai-review-subject`) and the
school's explanation language from organization-service, calls the gateway with the school as payer
(surface `review_queue`) and writes the draft back (`PUT /api/v1/internal/attempts/:id/ai-draft`).
Speech (plan 82): a separate port `SpeechAssessor` (audio + reference + language → words with timings,
optional pronunciation scores), priced per hour of audio (`audio_per_hour`, `ai_calls.audio_ms`). Adapters
`whisper_local` (sidecar `infrastructure/whisper`, NB-Whisper via faster-whisper, :8001, no key), `azure_speech`
(Pronunciation Assessment, `nb-NO`; REST up to 30 s, Speech SDK beyond; `AZURE_SPEECH_KEY`) and `fake`.
Capabilities `voice_review` and `voice_review_pronunciation` consume `exercise.attempt.routed_for_review` for
`read_aloud` (mode `read`), read WAV `speech` variants from media-service and PUT `reading.prompts[]` back; the
verdict is computed by exercise-engine from the transcript, not by ai-service. Keys `ai.voice_review`,
`ai.voice_review_pronunciation`. Shadow run: `POST /api/v1/admin/ai/evals/voice_review/run { modelId, pronunciation? }`.
Model comparison (plan 79, step 1.6): `POST /api/v1/admin/ai/evals/review_draft/run { modelId, promptVersion? }`
reruns teachers' settled drafts (exercise-engine `GET /api/v1/internal/ai-review-cases`) on a candidate
via `ModelCaller` (named model, no gate/fallback/breaker, surface `admin_eval`) and scores it against
what teachers kept and discarded; runs in `ai_eval_runs` (counts only, no text), compared at `GET …/runs`.
Student assistant (plan 83, key `ai.student_assist`, capability `student_assist@1`): a tool loop (≤ 4 rounds,
each round a separate gated/recorded call, surface `assistant_<kind>`) over read-only tools served by
content-service (`internal/assist/*`), exercise-engine (`internal/attempts/:id/assist-review`,
`assist-scope`) and scheduling-service (`internal/sessions/:id/assist`); the model never sees an answer key.
Payer by the server (`AssistPayerResolver`): the school pays only for an active enrolment of its active
student that organization-service's `assistantAllowed` lets through (school setting
`GET/PUT /api/v1/schools/:id/assistant-access`, modes `off` / `all_students` / `selected_groups` /
`selected_students`); anything else → the learner's own plan. Learner routes (`StudentGuard`, role `student`):
`GET ai/assist/availability`, `POST ai/assist/messages` (JSON, or SSE with `?stream=1` — events `delta`,
`reset`, `answer`, `refused`, `unavailable`; `X-Accel-Buffering: no`, no nginx change), `POST ai/assist/feedback`
(→ `ai.assist.feedback`, folded into `ai_assist_quality_daily`), `GET ai/usage/me?feature=`. Redis:
`ai:assist:rl:<userId>` (rate limit 20 / 10 min, `AI_ASSIST_RATE_LIMIT`, `AI_ASSIST_RATE_WINDOW_MS`).
Eval: `POST /api/v1/admin/ai/evals/student_assist/run { modelId, promptVersion? }` over the hand-written
`assist-set@1` (20 cases).
Pre-hand-in rehearsal "Проверить" (plan 84): `POST /api/v1/internal/precheck` (`x-internal-token`, synchronous, always 200)
`{ schoolId, userId, exerciseId, attemptId, subject, limits }` → `ok { feedback }` / `refused { reason, detail }`
(`unaskable`, `not_available`, `pool_empty`, `template_not_supported`, `exercise_limit`, `learner_limit`) /
`failed { errorCode }`. Agents `practice` (text, `practice@1`) and `practice_voice` (speech, one call per passage,
words only). Key `ai.practice`, surface `precheck`; `ai_calls.exercise_id` / `check_id`. Limits: school pool
(`payer_id`), per learner per UTC month in credits, per (learner, exercise) by distinct `check_id` (the engine
reads them from the school setting). Output is `AiFeedback` (`packages/contracts/src/dto/ai`). The rehearsal
creates no `attempt.completed` and touches no progress or SRS cards. Entry point in exercise-engine:
`POST /api/v1/exercises/:exerciseId/attempts/:attemptId/check` `{ draftAnswer }`, which takes the key first and
calls the model only when the key does not settle the answer.
Grammar atoms (plan 85): `practice@2` and `review_draft@3` get the learner's atoms ∩ the course catalog and may return an
optional `atomRef` (`atomId` is not an enum — an unknown id becomes `null`); `review_draft@3` sends `atomRef` to the
engine only when the request carried a catalog. Catalog from content-service; any failure = empty catalog.
Sound explanations (plan 86, step 9.2): `pronunciation_explain@2` (also `voice_review_explain`, same prompts) adds
content-service's articulation base (`internal/sound-atoms`, in the explanation language) to the inventory notes;
`commonError` only for ru/uk readers, `ukNote` only for uk; one `SoundExplainer` serves rehearsal, sentence drill and
hand-in; any failure = inventory notes only.
Reference words pre-check (plan 86, step 13.2c): `POST internal/reference-clips/check { language, words[] }` — the refusals a
reference clip makes before synthesis (`not_in_lexicon`, `tone_ambiguous` by all variants, …), one lexicon read, nothing billed;
content-service's `prisma/tools/sound-drill.ts` fails a drill word refused here.
Session verdict (plan 86, step 13.3): `internal/sentence-checks` takes an optional `target { atomId, words, context:
'word'|'fluent', explained[] }` and answers `target { measured, reason?, passed, weakest { key, … }, explained }` — our
verdict by the native thresholds on the target words only; a miss whose `key` is already in `explained` is not sent to the
model again. Refusals before any call: `target_not_scored` (the toneme stays with `toneme-checks`), `target_not_in_sentence`.
Follows Clean Architecture.
Port: `3010`. Database: `ai_db`. Exchange: `ai.events` (`ai.call.completed`, folded by
analytics-service into `ai_usage_daily`). Redis DB `6`, key prefix `ai:`.
Gateway routes: `/api/v1/ai/*`, `/api/v1/admin/ai/*` (`platform_admin`).

### 13. Subscription Service (NestJS)
Plans, subscriptions and feature keys for every payer (plan 78, umbrella plan 48). Entitlements are
data, not code: a plan is a set of versioned rows (`plans` → immutable `plan_versions` →
`plan_features`), a subscription points at a plan version, so editing a plan never silently changes
existing subscribers. Payer (`BillingAccount`) is a `workspace` (school, SOLO included) or a `user`
(self-study student). Feature keys (`ai.review_draft`, `ai.review_direct`, `ai.student_assist`,
`ai.practice`, `ai.authoring`; later `scheduling`, `payments`) live in a code catalog with their limit
kind; monthly AI credits per key. Manual grants add a key/credits on top of the plan for a period.
No payment yet — `platform_admin` assigns plans; billing is a separate future plan.
Entitlements resolution: open subscription → its plan version; none → free plan of the audience
(`free_workspace` / `free_individual`); active grants on top. Snapshot `version` = account revision.
Consumes `school.created` and `auth.user.registered` (students) → account + free subscription.
Publishes full snapshots `subscription.entitlements.changed` via an outbox; a refresh job (every 60 s)
expires subscriptions and republishes when time changes rights (`validUntil`). ai-service projects
the snapshots into `ai_payer_entitlements` and reads through the internal API on a miss.
UI reads `GET /api/v1/subscriptions/me[?workspaceId=]` and only hides buttons (`useCan()` in web);
the services enforce.
Follows Clean Architecture.
Port: `3011`. Database: `subscriptions_db`. Exchange: `subscription.events`. No Redis.
Internal: `GET /api/v1/internal/entitlements?type=&id=` (`x-internal-token`, not exposed by gateway).
Gateway routes: `/api/v1/subscriptions/*`, `/api/v1/admin/subscriptions/*` (`platform_admin`).

## API Documentation Strategy

Each microservice exposes its own Swagger UI locally for development, plus JSON spec endpoint for aggregation.

### Per-service setup

- Swagger UI: `http://<service>:<port>/api/docs`
- OpenAPI JSON: `http://<service>:<port>/api/docs-json`
- NestJS: `@nestjs/swagger` with `DocumentBuilder`
- C# Auth Service: Swashbuckle on `/swagger/v1/swagger.json`

### Aggregated documentation

A dedicated `api-docs-service` (static HTML + nginx) hosts a single Swagger UI bundle configured with `urls` parameter pointing to each service's JSON spec. Users switch between services via dropdown.

- Accessed through API Gateway at `/api/docs`
- Each service registered in `docs-config.json`
- No merging of specs — each service keeps its own namespace

### Documentation conventions

All services must document:
- Every endpoint with `@ApiOperation`, `@ApiResponse`
- All DTOs with `@ApiProperty` including descriptions and examples
- Authentication via `@ApiBearerAuth`
- Tags grouped by feature (`@ApiTags`)
- Error response schemas

## Inter-Service Communication

- **Synchronous**: HTTP/gRPC for immediate responses
- **Asynchronous**: RabbitMQ events with idempotent consumers (via `processed_events` table)

### Event naming convention

`<domain>.<entity>.<action>` — e.g., `user.registered`, `profile.created`, `school.member.added`

### Event payload convention

All events include: `eventId` (UUID), `eventType` (string), `timestamp` (ISO 8601), `payload` (domain data), `version` (schema version).

## Client Applications

- **Web (schools/tutors)**: Dashboard for content creation, student management, analytics
- **Web (students)**: Personal dashboard, lesson completion, statistics
- **Mobile (students)**: VoxOrd (React Native) — primary mobile learning interface

## Development Order

1. **Phase 1**: User Profile Service + Organization Service + API Docs Service
2. **Phase 2**: Content Service + Media Service
3. **Phase 3**: Exercise Engine + Learning Service
4. **Phase 4**: Notification Service + Analytics Service

## Shared Packages (planned)

- `@ssz-platform/shared-kernel` — base domain classes, Result type, common interfaces
- `@ssz-platform/events-contracts` — TypeScript interfaces for all RabbitMQ events
- `@ssz-platform/swagger-conventions` — shared Swagger decorators and error schemas

## Conventions

- Code comments in English only
- Detailed command explanations in responses
- When context is ambiguous, share full file contents
- Prefer complete file rewrites over partial snippets
- Git Flow branching with PRs
- Each development step must be small enough to test and debug in isolation before moving to the next
- **User installs all dependencies manually to control versions — Claude Code must LIST required packages and their purpose, but must NOT run `npm install` / `yarn add` automatically. Wait for user confirmation that packages are installed before proceeding.**
- After each development step, stop and wait for the user to test and confirm before moving to the next step