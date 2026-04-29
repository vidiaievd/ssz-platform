# SSZ Platform — Project Status

> **Last updated**: 2026-04-29
> **Branch**: feature/sprint-06-exercise-engine-gaps

## Overall Progress

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | User Profile Service + Organization Service + API Docs Service | ~70% |
| Phase 2 | Content Service + Media Service | Complete |
| Phase 3 | Exercise Engine Service + Learning Service | ~90% (Exercise Engine complete; SRS deferred to Sprint 6) |
| Phase 4 | Notification Service + Analytics Service | Notification complete; Analytics not started |

---

## Services at a Glance

| Service | Stack | Status | Detail |
|---------|-------|--------|--------|
| Auth Service | C# / ASP.NET Core 8 | Complete | [details](services/auth-service.md) |
| User Profile Service | NestJS | Complete | [details](services/user-profile-service.md) |
| Organization Service | NestJS | Complete | [details](services/organization-service.md) |
| Content Service | NestJS | Complete (Blocks 1–6) | [details](services/content-service.md) |
| Media Service | NestJS | Complete | [details](services/media-service.md) |
| Notification Service | NestJS | Complete (email; push/in-app deferred) | — |
| Exercise Engine Service | NestJS | Complete (Sprint 5) | [details](services/exercise-engine-service.md) |
| Learning Service | NestJS | Complete (core, no SRS) | [details](services/learning-service.md) |
| Analytics Service | NestJS | Not started | — |
| API Docs Service | nginx + static HTML | Not started | — |
| VoxOrd (Mobile) | React Native 0.84 | Not started | — |
| Web (Tutor/School) | TBD | Not started | — |
| Web (Student) | TBD | Not started | — |

---

## Infrastructure

- **docker-compose.yml** — orchestrates all services (learning-service and exercise-engine-service entries complete ✅):
  - PostgreSQL 16 (`ssz-postgres`) — primary database cluster
  - Redis 7 (`ssz-redis`) — cache, rate limiting, OTP replay guard
  - RabbitMQ 3 with management plugin (`ssz-rabbitmq`) — async events on `ssz.events` topic exchange
  - MinIO (`ssz-minio`) — S3-compatible object storage; two buckets: `ssz-public` (avatars), `ssz-private` (presigned)
  - MailHog (`ssz-mailhog`) — local SMTP trap, web UI on :8025
  - nginx (`ssz-nginx`) — API gateway, rate limiting, upstream routing
  - pgAdmin 4 — database administration
  - NestJS services: user-profile, organization, content, media, notification, learning ✅, exercise-engine ✅
  - Auth service: ASP.NET Core 8
- **postgres/init.sql** — creates databases and users per service (least-privilege)
- **Dockerfiles** — all six application services have multi-stage production Dockerfiles
- **.env.example** — root file documenting all docker-compose secrets

---

## Architecture Patterns Implemented

All NestJS services follow **Clean Architecture** (Domain → Application → Infrastructure → Presentation):

- **CQRS** via `@nestjs/cqrs` — Commands for writes, Queries for reads
- **Repository pattern** — Prisma repos implement domain interfaces; injected via DI tokens (Symbols)
- **Result\<T, E\>** — functional business error handling; exceptions only for infrastructure failures
- **Soft deletes** — `deleted_at` timestamp on all entities
- **RabbitMQ events** — domain entities raise events; published after persistence to `ssz.events` topic exchange
- **Idempotent consumers** — `processed_events` table prevents duplicate processing on all consumers
- **DLX (dead-letter exchange)** — `ssz.events.dlx` for failed messages; requeue-once-then-dead-letter
- **Visibility Guard** — polymorphic access control across all content read endpoints
- **BullMQ queues** — async media processing (image resize, audio conversion)
- **Short-lived JWT tokens** — password reset and email verification use symmetric JWT (same key as MFA challenge tokens), no DB table required
- **IP-level rate limiting** — `RedisRateLimitStore` on login endpoint; progressive lockout

---

## Auth Service — Implemented Features

- Registration with role assignment (student / tutor)
- Login with account lockout (DB-level) + IP rate limiting (Redis)
- MFA: TOTP setup, verification, backup codes
- JWT RS256 (RSA-4096): access token (15 min) + refresh token rotation with family theft detection
- Logout (revokes all refresh tokens)
- Forgot password → `POST /api/v1/auth/password/forgot` (anti-enumeration: always 204) → publishes `auth.password_reset_requested`
- Reset password → `POST /api/v1/auth/password/reset`
- Email verification request → `POST /api/v1/auth/email/verify/request` (authenticated)
- Email verification confirm → `POST /api/v1/auth/email/verify/confirm`
- Role assignment (self-service for student/tutor; admin-gated for others)
- Consumes `user.platform.role.assigned` from Organization Service

---

## Media Service — Implemented Features

- Pre-signed upload URL generation (`POST /api/v1/media/uploads/request`)
- Upload finalization with S3 existence check (`POST /api/v1/media/uploads/:assetId/finalize`)
- Image processing: webp variants at 256/512/1024px via Sharp (BullMQ worker)
- Audio processing: opus (64kbps) + mp3 (128kbps) with loudnorm via fluent-ffmpeg (BullMQ worker)
- Asset queries with presigned download URLs for private assets, public URLs for avatars
- Soft delete with storage key cleanup
- Publishes: `media.uploaded`, `media.processing_completed`, `media.processing_failed`, `media.deleted`

---

## Notification Service — Implemented Features

- Consumes `auth.user.registered` → sends welcome email
- Consumes `auth.email_verification_requested` → sends verification email
- Consumes `auth.password_reset_requested` → sends password reset email
- Notification status lifecycle: PENDING → SENDING → SENT / FAILED / PERMANENTLY_FAILED (max 3 attempts)
- MailHog for local SMTP; production SMTP via environment config
- Idempotent RabbitMQ consumer with DLX

**Deferred to later sprint**: push notifications (FCM), in-app notifications, user preferences/unsubscribe, MJML template engine, BullMQ email queuing, school invitation emails.

---

## Learning Service — Implemented Features

- **Assignments** — tutor-driven content assignment with due dates, status lifecycle (ACTIVE → COMPLETED / CANCELLED / OVERDUE), school role authorization
- **Enrollments** — student-driven self-paced enrollment with access-tier enforcement (PUBLIC_FREE, FREE_WITHIN_SCHOOL, ASSIGNED_ONLY, etc.)
- **Progress tracking** — unified `UserProgress` per (user, content_type, content_id); `recordAttempt`, `markNeedsReview`, `resolveReview` state machine
- **Free-form submission review** — `Submission` aggregate with revision history; PENDING_REVIEW → APPROVED / REJECTED / REVISION_REQUESTED → RESUBMITTED cycle
- **Scheduled jobs** — BullMQ repeating job every 5 minutes to detect and mark overdue assignments
- **RabbitMQ consumers** — `exercise.attempt.completed` (updates progress); `container.published` (skeleton)
- **Health checks** — `/health/live` (liveness) and `/health/ready` (DB + Redis + RabbitMQ via `@nestjs/terminus`)
- **Swagger** — full OpenAPI at `/api/docs` covering Assignments, Enrollments, Progress, Submissions
- **Structured logging** — `nestjs-pino` with correlation IDs propagated via `x-correlation-id` header

**Published events**: `learning.assignment.created`, `learning.assignment.completed`, `learning.assignment.cancelled`, `learning.assignment.overdue`, `learning.assignment.due_date_updated`, `learning.enrollment.created`, `learning.enrollment.completed`, `learning.enrollment.unenrolled`, `learning.progress.completed`, `learning.progress.updated`, `learning.submission.created`, `learning.submission.reviewed`, `learning.submission.resubmitted`

**Deferred to Sprint 6**: SRS (FSRS algorithm, spaced repetition queue, Redis-backed due-item cache)

---

## What Comes Next

### Phase 3 remaining (Sprint 6)
- **`@ssz/contracts` — formal event types** ✅ Done (Sprint 6 / Step 1) — all Learning Service and Exercise Engine events typed; 7 shared enums; `BaseEvent<T>` / `DomainEvent<T>` envelopes; both services compile and test green
- **Infrastructure: learning-service + exercise-engine-service in docker-compose + nginx** ✅ Done (Sprint 6 / Step 2)
- **Learning Service — content sync consumers + ADR-007** ✅ Done (Sprint 6 / Step 3) — `ContainerPublishedConsumer` (cache invalidation), `ContainerDeletedConsumer` (cascade cancel/unenrol), `IContainerItemListCache` + Redis impl, `ContainerCompletionService`, ADR-007; 122 tests green
- **Exercise Engine Service — gaps** ✅ Done (Sprint 6 / Step 4) — `OrderingValidator`, `ExerciseUpdatedConsumer`, `GET /api/v1/attempts/:attemptId` + `GET /api/v1/attempts/me` (cursor-paginated); 164 tests green
- **Learning Service — SRS** — FSRS algorithm, spaced repetition queue, Redis-backed due-item cache

### Phase 4 (Sprint 5–6)
- **Analytics Service** — aggregation, school/tutor dashboards, student reports, export
- **Notification Service additions** — SRS study reminders, school invitations, push (FCM), in-app

### Infrastructure / Cross-cutting
- **API Docs Service** — aggregated Swagger UI with multi-spec dropdown
- **VoxOrd mobile app** — React Native student interface
- **Web apps** — tutor/school dashboard, student learning interface

---

## Known Outstanding Gaps

- Notification Service: push, in-app, preferences/unsubscribe, school invitation email, MJML templates — all deferred
- Auth Service: `email_verified` is tracked but login is not blocked for unverified accounts (by design for MVP)
- Content Service: no full-text search, no batch tag assignment, media reference integrity not yet integrated
- Learning Service: no SRS (deferred Sprint 6); ADR-008 not yet written; no e2e integration tests with real infrastructure
- Exercise Engine Service: LLM validator deferred to Sprint 7; Learning Service notification on free-form routing is fire-and-forget (no retry/DLQ)
- All services: no end-to-end integration tests across services
- Media Service: shadow database issue (P3014) blocks `prisma migrate dev` — workaround: grant `CREATEDB` to `media_service` user or use `shadowDatabaseUrl`
