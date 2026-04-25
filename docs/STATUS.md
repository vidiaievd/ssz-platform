# SSZ Platform — Project Status

> **Last updated**: 2026-04-25
> **Branch**: feature/media-service

## Overall Progress

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | User Profile Service + Organization Service + API Docs Service | ~70% |
| Phase 2 | Content Service + Media Service | Complete |
| Phase 3 | Exercise Engine Service + Learning Service | Not started |
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
| Exercise Engine Service | NestJS | Not started | — |
| Learning Service | NestJS | Not started | — |
| Analytics Service | NestJS | Not started | — |
| API Docs Service | nginx + static HTML | Not started | — |
| VoxOrd (Mobile) | React Native 0.84 | Not started | — |
| Web (Tutor/School) | TBD | Not started | — |
| Web (Student) | TBD | Not started | — |

---

## Infrastructure

- **docker-compose.yml** — orchestrates all services:
  - PostgreSQL 16 (`ssz-postgres`) — primary database cluster
  - Redis 7 (`ssz-redis`) — cache, rate limiting, OTP replay guard
  - RabbitMQ 3 with management plugin (`ssz-rabbitmq`) — async events on `ssz.events` topic exchange
  - MinIO (`ssz-minio`) — S3-compatible object storage; two buckets: `ssz-public` (avatars), `ssz-private` (presigned)
  - MailHog (`ssz-mailhog`) — local SMTP trap, web UI on :8025
  - nginx (`ssz-nginx`) — API gateway, rate limiting, upstream routing
  - pgAdmin 4 — database administration
  - NestJS services: user-profile, organization, content, media, notification
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

## What Comes Next

### Phase 3 (Sprint 3–4)
- **Exercise Engine Service** — exercise generation, answer validation, scoring, LLM integration
- **Learning Service** — material assignment, enrollment, SRS queue (FSRS), progress tracking

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
- All services: no end-to-end integration tests across services
- Media Service: shadow database issue (P3014) blocks `prisma migrate dev` — workaround: grant `CREATEDB` to `media_service` user or use `shadowDatabaseUrl`
