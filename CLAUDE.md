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
Platform admin panel (plan 90, phase 1): admin level `super` / `admin` / `support` in `admin_levels` (only for
`platform_admin`; first super via `docker exec infrastructure-auth-service-1 dotnet AuthService.API.dll admin bootstrap <email>`).
Claim `admin_level` appears only in tokens of client `admin` (`ClientTypes.Admin`, lifetime 12 h for platform_admin × admin).
Panel sign-in only through `api/v1/auth/admin/session/*`: `login` → `{ mfaRequired, challenge }`, or without MFA
`{ mfaSetupRequired, setup }` with a 10-min token that can only set MFA up (`mfa-setup`, `mfa-setup/confirm`); `mfa`,
`mfa/backup`, `refresh`, `logout`. Refresh token only in cookie `ssz_admin_rt` (httpOnly, Secure, SameSite=Strict,
`Path=/api/v1/auth/admin/session`), never in a body. `AdminSessionGate` (role + level + MFA) runs on every one of these,
including each refresh. Shared `login` / `mfa/challenge` / `mfa/backup` with `clientType: admin` → 400 `ADMIN_SESSION_ROUTES_ONLY`.
Errors: 403 `ADMIN_ACCESS_DENIED` / `MFA_SETUP_REQUIRED`. Wrong MFA codes count per account for all clients
(`mfa:attempts:<userId>`): 5 per 15 min → 423; disabling 2FA with a code counts the same way.
Level management `GET/PUT/DELETE api/v1/auth/admin/admins[/:userId]` — super only; reason required; no self-change
(400 `ADMIN_SELF_CHANGE`), never the last super (`ADMIN_LAST_SUPER`); revoking clears the role, the level row and
sessions of client `admin` (web sessions stay).
Journal: table `admin_audit` in `auth_db` (same transaction; id = eventId) and event `admin.action.performed` on
`auth.events` (routing key without the `auth.` prefix; envelope `eventType` = `AdminActionPerformedEvent`, numeric
`version` 1). Payload `{ service: 'auth', actorId?, actorLevel?, action, targetType, targetId, reason?, before?, after? }`;
actions `admin.granted` / `admin.level_changed` / `admin.revoked`. Published after commit; broker failure is logged only.
Shared rule and event types live in `packages/contracts` (`AdminLevel`, `adminLevelAtLeast()`, `ADMIN_EVENT_TYPES`).

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
Platform admin reads (plan 90, phase 1; module `modules/admin-schools`; verifier reads `admin_level`; level `support`
on every route through `AdminLevelGuard` + `@RequireAdminLevel`; no admin journal here until phases 3/5):
`GET admin/schools?search=&kind=SCHOOL|SOLO&status=active|inactive|deleted&sort=-createdAt|createdAt|name|-name&page=&limit=`
(limit 1–100, default 25; ties by id) → `{ items, total, page, limit }`. `status` is derived from `isActive` / `deletedAt`
until phase 5 adds a stored status; without `status` deleted schools are listed too. Row counts `students` (active
STUDENT in roster) and `teachers` (TEACHER) come from one groupBy; the owner is not in the roster and is counted nowhere.
`GET admin/schools/:id` — card (deleted ones too; non-UUID → 404 without a DB query): contacts, `owner` from
profile-service (failure → `null`, the card still answers), `counts` (+ `archivedStudents`, `staff`, `pendingApplications`,
`pendingInvitations`), `groups` (with `isDefault`), `courses { count, ids }`; course titles come from content-service.
`GET admin/stats?from=&to=` — UTC days `YYYY-MM-DD`, both ends inclusive (default: last 30 days ending today; > 366 days,
`from > to` → 400) → `{ from, to, schools { total, byStatus, byKind, createdInPeriod }, students, teachers, daily[] }`.
People are counted once per platform (student = active STUDENT row; teacher = TEACHER row or SOLO owner); `daily` has
every day of the period, zeros included.
Admin roster and settings (plan 90, phase 3, step 5; `AdminSchoolRosterPrismaReader`, level `support`, gateway covered by
`location /api/v1/admin/schools`): `GET admin/schools/:id/members?role=&status=&groupId=&page=&limit=` (limit 1–200,
default 50; newest first) — `role` `student` / `teacher` / `staff` (`rosterRole` keeps the exact role), `status`
`active` / `archived`, `groupId` = in the group today (active membership or unfinished teacher assignment; a foreign
school's group → empty); a row has `groups[]` (`as` student/trial/observer/teacher, `isDefault` = the hidden SOLO group)
and the denormalised `name` (null before sync). No email, no activity. `GET admin/schools/:id/settings` — review
policy, `reviewAi`, `assistant`, `aiPrecheck` in one answer, as saved (no tariff check; review effort by template is not
in). Non-UUID / unknown school → 404 (deleted ones are found).

Student seats (plan 90, phase 4): `GET schools/:id/seats` (owner / admin / manager) → `{ used, limit, ceiling, state }`; panel
reads the plan limit from the `school_seat_limits` projection only. `admin/schools` rows carry `seats { used, limit }` and
filter `seats=near|over` (near = ≥ 90 % of the limit, not over; over = above it); the card has full `seats`;
`admin/stats` has `seats { used, limit, schoolsLimited, near, over }` with `{ total, items[≤100], truncated }` lists.

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
Step 14.3: `nb:kj` and `nb:y` keep only words on which Azure tells the sound from the learner's substitute
(`infrastructure/scripts/plan-86-sound-blindspots.mts`); `carriersFromWords` judges their phrases on those words only.
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
Sound atoms (plan 86, step 8.3): `SOUND_ATOM` shadow cards, introduced on day 2 of 14; a pronunciation session's ratings
(`gapResults`, GOOD/HARD/AGAIN → 90/70/0) rate them by the gap's `score`. `atoms_flagged` with source `ai_session` pulls a
card but never introduces one. Internal: `GET internal/learners/:userId/sound-atoms?language=` (`x-service-token`).

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
modality does not lift the lapse to HARD. Step 13.5b: on hand-in the weak sounds the session did not rate (diagnostic's
weak families + other sounds the takes' remarks named, kept in `session_state.incidental`) go out as one
`atoms_flagged` with source `ai_session`; learning pulls a card on it but never introduces one.
Step 14.1: a new session passes ai-service's door first (`internal/sound-sessions/admit`) — 422 `SESSION_LIMIT` /
`POOL_EMPTY`, 403 `NOT_AVAILABLE`; the start answers `budget` (warning only, never a refusal). Payer (`SoundSessionPayer`,
Q32): the learner's roster school when its `ai-precheck` is on, else the learner's own plan — at the door and on every
take; takes carry `sessionId` = the attempt id.
Step 14.2: diagnostic takes go with `explain: false` (no model call); toneme takes carry the probe as `exerciseId`. Live
end-to-end run on Azure dev: `infrastructure/scripts/plan-86-session-live.mts`.

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
Platform admin journal (plan 90, phase 1, step 6): module `admin-audit` consumes `admin.action.performed` from
`auth.events` and `subscription.events` (queues `analytics-service.admin-audit.auth` / `.subscription`, prefetch 1,
dedup via `processed_events` key `admin-audit-log`) into `admin_audit_log` (id = source eventId). `service` comes from the
exchange, never from the payload. `GET api/v1/admin/audit?service=&actorId=&targetType=&targetId=&from=&to=&cursor=`
(level `support`; newest first, keyset on (`occurredAt`, `id`), `limit` 1–200 default 50, `from` inclusive, `to`
exclusive; `from > to` or a foreign cursor → 400) → `{ items, nextCursor }`. Malformed message → nack without requeue;
DB failure → one requeue. Sources: `auth.events`, `subscription.events` and (phase 3) `ai.events` (queue `analytics-service.admin-audit.ai`,
`service: 'ai'`). This journal is separate from the school activity feed (`audit` module).
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
Pronunciation session door (plan 86, step 14.1): `POST internal/sound-sessions/admit { userId, schoolId, resume? }`
(`x-internal-token`, always 200) — gate (`practice_voice` under `ai.practice`), then the learner's sessions per UTC day
(`AI_SOUND_SESSION_DAILY_LIMIT` 3, Redis `ai:sound-session:day:`) → `admitted { budget { payer, metered, remainingCredits,
estimatedCredits, periodEnd } }` / `refused { session_limit | not_available | pool_empty }`. `sentence-checks` and
`toneme-checks` take an optional `sessionId`: surface `pronunciation_session`, the session's take cap
(`AI_SOUND_SESSION_TAKE_LIMIT` 40, `ai:sound-session:takes:`) instead of the sentence's daily tries. `budget.estimatedCredits`
= `AI_SOUND_SESSION_ESTIMATED_CREDITS` (35, step 14.2 ledger). `sentence-checks` `explain: false` measures without
`pronunciation_explain` (a session's diagnostic); `toneme-checks` takes an optional `exerciseId` for the ledger.
Session verdict (plan 86, step 13.3): `internal/sentence-checks` takes an optional `target { atomId, words, context:
'word'|'fluent', explained[] }` and answers `target { measured, reason?, passed, weakest { key, … }, explained }` — our
verdict by the native thresholds on the target words only; a miss whose `key` is already in `explained` is not sent to the
model again. Refusals before any call: `target_not_scored` (the toneme stays with `toneme-checks`), `target_not_in_sentence`.
Pronunciation analysis (plan 86, steps 4–5c, 9): `prosody_markup` (`ai.authoring`, prompt `@1`) marks a phrase's prosody
layer via `internal/prosody/phrase-marks`; `internal/prosody/word-stresses` (lexicon + spaCy, Redis 7 days) returns word
stresses and per-word `sounds`. The sound atoms `nb:<family>` / `nb:tone` are the analysis vocabulary; `pronunciation_explain@2`
explains a mistake with the articulation base from content-service. Pitch (F0) and sex-of-voice handling run in the
`whisper` sidecar (`infrastructure/whisper`).
Platform admin (plan 90, phase 3): `PUT admin/ai/payer-policies/:payerType/:payerId` requires `reason` (≤ 500) and writes
`admin_audit` in `ai_db` (`recordAdminAction(tx, entry)`, same transaction; action `payer_policy.changed`, targetType
`workspace` / `user`, `before` absent when no policy existed — the default was "on, any region") and the event
`admin.action.performed` on `ai.events` through the outbox (envelope as subscription's). Other admin changes
(bindings, model test) join the journal in phase 7. `GET admin/ai/usage/:payerType/:payerId` (level `support`) → per AI key
(`AI_FEATURE_KEYS` in `domain/entitlement.ts` — mirrors subscription's seven `ai.*` keys, add a key in both places):
`feature`, `enabled`, `used`, `total`, `periodEnd`, `limits`, plus the effective `policy`. The spend is the learner
`ai/usage/me` calculation (`FeatureUsage`: max(call ledger, gate counter), the counter is never created); `enabled` is
the tariff only, `policy.aiEnabled: false` overrides it; an unknown payer = free plan of its audience; tariff or
ledger unreadable → 503.
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
Platform admin (plan 90, phase 1): every `admin/*` route is guarded by `AdminLevelGuard` + `@RequireAdminLevel` (reads
`support`; PUT subscription, grants, revoke, DELETE subscription — `admin`; plan catalog create/patch/versions/archive —
`super`); a route without a level admits only `super`; `platform_admin` token without `admin_level` → 403
`ADMIN_LEVEL_REQUIRED`. Actor via `@CurrentAdmin()`.
Journal: table `admin_audit` in `subscriptions_db` (`actor_id`, `actor_level`, `reason` NOT NULL, `before` / `after` jsonb)
written by `recordAdminAction(tx, entry)` in the same transaction as the change, plus the outbox row (outbox is plain rows).
`reason` (non-empty, ≤ 500) is required on PUT subscription, POST grants (it is the grant's reason), POST grants/:id/revoke,
POST plans, PATCH plans/:code, POST plans/:code/versions, POST plans/:code/archive; DELETE subscription takes `?reason=`.
Actions: `subscription.assigned` / `subscription.canceled` / `grant.issued` / `grant.revoked` (targetType `workspace` /
`user`, targetId = schoolId / userId) and `plan.created` / `plan.renamed` / `plan.revised` / `plan.archived` (targetType
`plan`). Admin events use envelope `eventVersion: '1.0'`, `source: 'subscription-service'` (auth's envelope is numeric
`version` — readers must accept both).
Batch read: `POST admin/subscriptions/accounts/lookup { type, ids[] }` (1–200 UUIDs, duplicates answered once) →
`{ items }` in request order; unknown id → `hasAccount: false` on the free plan, never 404. Rule as in entitlements:
no account / no open subscription / expired → free plan of the audience.
Switching a key off (plan 90, phase 3, step 1): a grant has `enabled` (default `true`); `enabled: false` is a switching-off
grant — no credits, no limits (else 422) — and is applied last, so it turns the key off over the plan and over any
switching-on grants, whatever the row order; revoking it brings the plan back. `grant.issued` carries `after.enabled`;
`/subscriptions/me` lists in `grants` only the grants that give a key (an off key is `enabled: false` in `features`);
`validUntil` counts its end; the entitlements event is unchanged. The payer policy `aiEnabled: false` stays the
"all AI of the school" switch.
Dashboard stats: `GET admin/subscriptions/stats?withinDays=7` (level `support`, `withinDays` 1–90) → `plans[]` (every plan,
archived too: `subscribers`, `trial`, `byVersion` — a version below `currentVersion` is a subscriber not moved),
`payers.workspace|user { accounts, withSubscription, withoutSubscription }` (a payer without an account is on the free
plan and unknown here, so not counted), `endingSoon.grants` (with `enabled`, scheduled ones too) and
`endingSoon.subscriptions` (up to 100 each, `truncated`).

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