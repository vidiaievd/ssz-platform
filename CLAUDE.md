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
Follows Clean Architecture.
Database: `organizations_db`

### 4. Content Service (NestJS)
Learning material management: courses → modules → lessons → exercises.
Follows Clean Architecture.
Database: `content_db`

### 5. Learning Service (NestJS)
Material assignment, progress tracking, SRS, adaptive review queue.
Follows Clean Architecture.
Database: `learning_db`

### 6. Exercise Engine Service (NestJS)
Exercise generation and validation, scoring logic, LLM integration.
Follows Clean Architecture.
Database: `exercises_db`

### 7. Media Service (NestJS)
Upload, storage, processing of media files. S3-compatible storage.
Simplified structure acceptable.
Database: `media_db`

### 8. Notification Service (NestJS)
Push (FCM), email, in-app notifications. Study reminders.
Simplified structure acceptable.
Database: `notifications_db`

### 9. Analytics Service (NestJS)
Analytics for schools/tutors and students. Aggregation, reports, export.
Follows Clean Architecture.
Database: `analytics_db`

### 10. API Gateway (nginx — exists)
Request routing, rate limiting, CORS, SSL termination.

### 11. API Docs Service (static + nginx)
Aggregated Swagger UI for all microservices via multi-spec dropdown.
Reads OpenAPI JSON from each service and displays them in a unified UI.

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