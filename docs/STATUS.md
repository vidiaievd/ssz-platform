# SSZ Platform — Project Status

> **Last updated**: 2026-04-24
> **Branch**: feature/Discovery-content-block

## Overall Progress

| Phase | Scope | Status |
|-------|-------|--------|
| Phase 1 | User Profile Service + Organization Service + API Docs Service | ~70% |
| Phase 2 | Content Service + Media Service | ~90% |
| Phase 3 | Exercise Engine Service + Learning Service | Not started |
| Phase 4 | Notification Service + Analytics Service | Not started |

---

## Services at a Glance

| Service | Stack | Status | Detail |
|---------|-------|--------|--------|
| Auth Service | C# / ASP.NET Core 8 | Complete | [details](services/auth-service.md) |
| User Profile Service | NestJS | Complete | [details](services/user-profile-service.md) |
| Organization Service | NestJS | Complete | [details](services/organization-service.md) |
| Content Service | NestJS | Complete (Blocks 1–6) | [details](services/content-service.md) |
| Media Service | NestJS | Not started | — |
| Exercise Engine Service | NestJS | Not started | — |
| Learning Service | NestJS | Not started | — |
| Notification Service | NestJS | Not started | — |
| Analytics Service | NestJS | Not started | — |
| API Docs Service | nginx + static HTML | Not started | — |
| VoxOrd (Mobile) | React Native 0.84 | Not started | — |
| Web (Tutor/School) | TBD | Not started | — |
| Web (Student) | TBD | Not started | — |

---

## Infrastructure

- **docker-compose.yml** — orchestrates all services:
  - PostgreSQL 16 (`ssz-postgres`) — primary database cluster
  - Redis 7 (`ssz-redis`) — cache, SRS queues, rate limiting
  - RabbitMQ 3 with management plugin (`ssz-rabbitmq`) — async events
  - pgAdmin 4 — database administration
  - NestJS services: organization, user-profile, content
- **nginx** — API Gateway (routing, CORS, rate limiting, SSL termination)
- **postgres/init.sql** — creates databases and users per service

---

## Architecture Patterns Implemented

All NestJS services follow **Clean Architecture** (Domain → Application → Infrastructure → Presentation):

- **CQRS** via `@nestjs/cqrs` — Commands for writes, Queries for reads
- **Repository pattern** — Prisma repos implement domain interfaces; injected via DI tokens (Symbols)
- **Result\<T, E\>** — functional business error handling; exceptions only for infrastructure failures
- **Soft deletes** — `deleted_at` timestamp on all entities
- **RabbitMQ events** — domain entities raise events; published after persistence
- **Idempotent consumers** — `processed_events` table prevents duplicate processing
- **Visibility Guard** — polymorphic access control across all content read endpoints
- **Slug generation** — auto-generated from titles with collision avoidance

---

## What Comes Next

### Immediate (Phase 2 completion)
- **Media Service** — file uploads, S3-compatible storage, image/audio/video processing

### Phase 3
- **Exercise Engine Service** — exercise generation, answer validation, scoring, LLM integration
- **Learning Service** — material assignment, enrollment, SRS queue, progress tracking

### Phase 4
- **Notification Service** — push (FCM), email, in-app, study reminders
- **Analytics Service** — aggregation, school/tutor dashboards, student reports, export

### Infrastructure / Cross-cutting
- **API Docs Service** — aggregated Swagger UI with multi-spec dropdown
- **VoxOrd mobile app** — React Native student interface
- **Web apps** — tutor/school dashboard, student learning interface

---

## Key Outstanding Gaps (across completed services)

- Auth Service: no logout / session revocation endpoint
- Content Service: no full-text search for discovery
- Content Service: no batch tag assignment
- Content Service: media reference integrity checking (S3 not yet integrated)
- All services: no load / performance testing
- No end-to-end integration tests across services
