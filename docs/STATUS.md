# SSZ Platform — Project Status

> **Last updated**: 2026-06-02
> **Branch**: feature/analytics-service-projections (→ dev)

## Overall Progress

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | User Profile Service + Organization Service + API Docs Service | ~75% |
| Phase 2 | Content Service + Media Service | Complete |
| Phase 3 | Exercise Engine Service + Learning Service | Complete |
| Phase 4 | Notification Service + Analytics Service | Complete (core) |

---

## Services at a Glance

| Service | Stack | Status | Detail |
|---------|-------|--------|--------|
| Auth Service | C# / ASP.NET Core 8 | Complete | [details](services/auth-service.md) |
| User Profile Service | NestJS | Complete | [details](services/user-profile-service.md) |
| Organization Service | NestJS | Complete (+ school type) | [details](services/organization-service.md) |
| Content Service | NestJS | Complete (Blocks 1–6) | [details](services/content-service.md) |
| Media Service | NestJS | Complete | [details](services/media-service.md) |
| Notification Service | NestJS | Complete (email + in-app nudge) | — |
| Exercise Engine Service | NestJS | Complete (Sprint 5) | [details](services/exercise-engine-service.md) |
| Learning Service | NestJS | Complete (+ internal snapshot API) | [details](services/learning-service.md) |
| Analytics Service | NestJS | **Complete (Phase B–D)** | — |
| API Docs Service | nginx + static HTML | Not started | — |

---

## Infrastructure

- **docker-compose.dev.yml** — orchestrates all services:
  - PostgreSQL 16 — primary database cluster (includes `analytics_db`)
  - Redis 7 — cache, rate limiting, OTP replay guard
  - RabbitMQ 3 — async events; exchanges: auth, profile, organization, content, learning, exercise-engine, media, notification, **analytics** (new)
  - MinIO — S3-compatible object storage
  - MailHog — local SMTP trap
  - nginx — API gateway; **`/api/v1/schools/*/dashboard` + `/api/v1/schools/*/activity` routing to analytics-service** added; `/api/v1/schools` prefix for org-service fixed
  - pgAdmin 4
- **postgres/init.sql** — `analytics_db` / `analytics_service` user added
- **infrastructure/.env.dev** — `ANALYTICS_SERVICE_DB_PASSWORD` added

---

## Architecture Patterns Implemented

All NestJS services follow **Clean Architecture** (Domain → Application → Infrastructure → Presentation):

- **CQRS** via `@nestjs/cqrs` — Commands for writes, Queries for reads
- **Repository pattern** — Prisma repos implement domain interfaces; injected via DI tokens (Symbols)
- **Result\<T, E\>** — functional business error handling; exceptions only for infrastructure failures
- **Soft deletes** — `deleted_at` timestamp on all entities
- **RabbitMQ events** — domain entities raise events; published after persistence
- **Transactional outbox** — `outbox` table + relay worker for at-least-once delivery (content, learning, organization services)
- **Idempotent consumers** — `processed_events` table; analytics uses per-processor composite key `(eventId, processorId)` so multiple projections can independently track the same event
- **DLX (dead-letter exchange)** — `ssz.events.dlx` for failed messages; requeue-once-then-dead-letter
- **Event archive** — Analytics Service stores every domain event from all exchanges for replay (`event_archive` with monotonic `sequence` cursor)
- **Event-driven read models (projections)** — Analytics builds denormalized read models from events; zero cross-service DB reads
- **BFF composite pattern** — ssz-platform-web aggregates multiple analytics endpoints in a single Route Handler; each widget is independently fault-tolerant
- **Visibility Guard** — polymorphic access control across all content read endpoints
- **BullMQ queues** — async media processing (image resize, audio conversion)
- **IP-level rate limiting** — `RedisRateLimitStore` on login endpoint; progressive lockout
- **Short-lived JWT tokens** — password reset and email verification use symmetric JWT

---

## Auth Service — Implemented Features

- Registration with role assignment (student / tutor)
- Login with account lockout (DB-level) + IP rate limiting (Redis)
- MFA: TOTP setup, verification, backup codes
- JWT RS256 (RSA-4096): access token (15 min) + refresh token rotation with family theft detection
- Logout (revokes all refresh tokens)
- Forgot password / reset password
- Email verification request / confirm
- Role assignment (self-service for student/tutor; admin-gated for others)
- Consumes `user.platform.role.assigned` from Organization Service

---

## Organization Service — Implemented Features

- Schools CRUD (create/read/update/soft-delete), slug uniqueness, auto-generation
- **School type** `ONLINE | HYBRID` (default `ONLINE`) — unlocks Today's classes conditional render
- School members (add/remove), invitations by email (JWT token in link)
- School groups / cohorts (create/read/update/delete, members management)
- Tutoring groups (private tutor ↔ students outside school)
- Transactional outbox for all domain events
- Publishes: `school.created`, `school.member.added`, `school.member.removed`, `school.invitation.sent`, `user.platform.role.assigned`

---

## Media Service — Implemented Features

- Pre-signed upload URL generation (`POST /api/v1/media/uploads/request`)
- Upload finalization with S3 existence check
- Image processing: webp variants at 256/512/1024px via Sharp (BullMQ worker)
- Audio processing: opus (64kbps) + mp3 (128kbps) with loudnorm via fluent-ffmpeg (BullMQ worker)
- Asset queries with presigned download URLs for private assets
- Soft delete with storage key cleanup
- Publishes: `media.uploaded`, `media.processing_completed`, `media.processing_failed`, `media.deleted`

---

## Notification Service — Implemented Features

- Consumes `auth.user.registered` → welcome email
- Consumes `auth.email_verification_requested` → verification email
- Consumes `auth.password_reset_requested` → password reset email
- **Consumes `analytics.nudge.requested`** → creates `STUDY_REMINDER` in-app notification record (D.1)
- Notification status lifecycle: PENDING → SENDING → SENT / FAILED / PERMANENTLY_FAILED (max 3 attempts)
- Idempotent consumers with DLX; separate `AnalyticsConsumerService` for `analytics.events` exchange

**Deferred**: push notifications (FCM), in-app delivery pipeline, user preferences/unsubscribe, MJML template engine.

---

## Learning Service — Implemented Features

- **Assignments** — tutor-driven content assignment with due dates, status lifecycle, school role authorization
- **Enrollments** — student-driven self-paced enrollment with access-tier enforcement
- **Progress tracking** — unified `UserProgress` per (user, content_type, content_id)
- **Submission review** — `Submission` aggregate with revision history; full status machine
- **Scheduled jobs** — BullMQ repeating job to detect and mark overdue assignments
- **SRS** — FSRS-6 algorithm; `ReviewCard` aggregate; Redis due queue; daily limits
- **Internal snapshot API** — `GET /internal/analytics/snapshot/{enrollments|progress|submissions}` (cursor-paginated, `x-service-token` protected) for Analytics initial seed
- **RabbitMQ consumers** — `exercise.attempt.completed`, vocabulary enrollment, container published/deleted
- Transactional outbox for all domain events
- Published events: all `learning.enrollment.*`, `learning.progress.*`, `learning.submission.*`, `learning.assignment.*`, `learning.srs.*`

---

## Analytics Service — Implemented Features

New service on port `3008`. Database `analytics_db`. Clean Architecture. JWT RS256 guard (global). Swagger at `/api/docs`.

### Event Archive (A.2)
- Wildcard consumer on every exchange → append-only `event_archive` (monotonic `sequence`, dedup by `eventId`)
- Replay API: `GET /internal/events?fromSeq=&types=&limit=`

### Directory Projections (B.2)
- `SchoolMembership { schoolId, userId, role, joinedAt }` — from `school.member.*`, `school.created`
- `UserDirectory { userId, displayName }` — from `profile.created/updated` (displayName added to `ProfileUpdatedEvent`)
- `ContainerDirectory { containerId, title, lang, containerType, leafItemCount=0 }` — from `content.container.*` (title added to `ContainerCreated/UpdatedEvent`)
- `ProcessedEvent` uses composite key `(eventId, processorId)` for multi-consumer idempotency

### Metric Projections + Initial Seed (B.3)
- `EnrollmentProjection` — from `learning.enrollment.*`; canonical school student set `schoolStudents(S)`
- `ProgressActivity` (append-only) — from `learning.progress.*`; source for sparklines, active counts, `lastActivity`
- `SubmissionProjection` — from `learning.submission.*`; pending reviews + age
- `SeedService` — idempotent on startup; calls learning-service snapshot API; populates all three projections from pre-archive data

### Dashboard Read API (B.4–B.7)
Authorization: `SchoolMembership` projection (no external HTTP call needed). Bearer JWT.

| Endpoint | Owner | Description |
|----------|-------|-------------|
| `GET /api/v1/schools/:id/dashboard/kpis` | all dashboard roles | 4 KPIs: value + delta + trend + spark[7] (0–100 normalized) |
| `GET /api/v1/schools/:id/dashboard/at-risk?limit=` | owner/admin | At-risk students: name (UserDirectory), course/lang (ContainerDirectory), lastSeen, progress |
| `GET /api/v1/schools/:id/dashboard/courses/health` | all | Per-course: enrollment, completion, trend (recent vs prev 7d), dropoff flag |
| `GET /api/v1/schools/:id/activity?limit=&cursor=` | all | Activity feed, cursor-paginated newest-first |
| `POST /api/v1/schools/:id/dashboard/nudge` | owner/admin | Nudge all at-risk → publish `analytics.nudge.requested` per student → `{ nudged: n }` |

**KPI definitions:**
- `active_students_7d` — DISTINCT userId in ProgressActivity last 7d scoped via EnrollmentProjection; hint: `of N enrolled`
- `lessons_completed_7d` — ProgressActivity `kind=completed` last 7d; hint: `across N courses`
- `pending_reviews` — SubmissionProjection `PENDING_REVIEW|RESUBMITTED` by schoolId; `sub: oldest: X hours`
- `at_risk` (owner/admin only) — active enrollees with no ProgressActivity in last `AT_RISK_THRESHOLD_DAYS` days

Delta: present when ≥14d of history; null before. Trend: up/down/flat from delta sign.

### School Activity Feed (B.7 — Audit Module)
Events captured: `school.member.added`, `content.container.published`, `learning.enrollment.created`, `learning.submission.{created,reviewed}`. actorName denormalized from UserDirectory at write time.

---

## Web App (ssz-platform-web) — School Dashboard BFF (C.1)

- `GET /api/schools/[id]/dashboard` — composite BFF endpoint
  - Resolves slug → schoolId (getMySchools fallback)
  - Parallel: kpis, at-risk (limit 3), course-health, activity (limit 6)
  - Each widget independently fault-tolerant: upstream error → `{ status: 'unavailable' }`
  - `todaysClasses` and `trial` always `{ status: 'unavailable' }` (pending D.3)
- `src/lib/dashboard/types.ts` — full TypeScript types
- `src/lib/dashboard/queries.ts` — per-widget `serverFetch` wrappers (server-only)
- 7 MSW integration tests (`queries.test.ts`)
- `analytics` added to `ServiceName` + env; `ANALYTICS_SERVICE_URL` in vitest.setup

---

## What Comes Next

### Immediate
- **PR**: merge `feature/analytics-service-projections` → `dev`

### Near-term
- **leafItemCount**: add `content.container.item.*` events to content-service so `ContainerDirectory.leafItemCount` is populated (completion ratio becomes meaningful)
- **Nudge email**: extend `UserDirectory` with email (from profile.created) so nudge can send email in addition to in-app notification
- **Phase D.3 — Scheduling / Today's classes** — separate scheduling service; `School.type: HYBRID` field is ready
- **Phase D.3 — Trial/billing** — separate billing service
- **Publish-approval (#5)** — content governance; own workstream/PR

### Deferred
- Sprint 10: API Docs Service — aggregated Swagger UI with multi-spec dropdown
- Sprint 7: LLM integration — exercise generation, free-form feedback

---

## Known Outstanding Gaps

- `ContainerDirectory.leafItemCount` always `0` — content-service emits no container-item events; completion ratio will be 0 until implemented
- `UserDirectory` has no email — nudge creates in-app notification only; email nudge deferred
- Notification Service: push (FCM), in-app delivery, preferences — deferred
- Auth Service: `email_verified` tracked but login not blocked for unverified accounts (MVP by design)
- Content Service: no full-text search, no batch tag assignment
- All services: no end-to-end integration tests across services
