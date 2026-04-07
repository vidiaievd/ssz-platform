# User Profile Service

NestJS microservice for managing user profiles on the SSZ EdTech platform.
Handles student and tutor profiles, target languages, qualifications, and notification preferences.

## Tech Stack

- **Framework**: NestJS (TypeScript)
- **ORM**: Prisma 5
- **Database**: PostgreSQL 16 (`profiles_db`)
- **Messaging**: RabbitMQ (AMQP via `amqplib`)
- **Cache**: Redis (ioredis)
- **Auth**: JWT RS256 validation via RSA public key (no Auth Service round-trip)
- **Logging**: Pino (`nestjs-pino`)
- **Docs**: Swagger at `/api/docs`

## Getting Started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Running infrastructure (postgres, rabbitmq, redis) from `../../infrastructure/docker-compose.yml`

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL, RABBITMQ_URL, REDIS_PASSWORD, JWT_PUBLIC_KEY
```

The `JWT_PUBLIC_KEY` must be the RSA-4096 public key exported from the Auth Service in PEM format.
Replace newlines with `\n` when putting it in the `.env` file.

### 3. Run database migrations

```bash
# Creates tables in profiles_db
npx prisma migrate dev --name InitialCreate
```

### 4. Start in development mode

```bash
npm run start:dev
```

Service starts on `http://localhost:3001`  
Swagger UI: `http://localhost:3001/api/docs`

### 5. Run with Docker Compose (standalone)

First create the shared Docker network if it doesn't exist:

```bash
docker network create ssz_network
```

Then start the service and its dedicated DB:

```bash
docker compose up --build
```

> Note: This compose file spins up only `user-profile-service` + `profiles_db`.
> RabbitMQ and Redis must be running via `../../infrastructure/docker-compose.yml`.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development` / `production` / `test` |
| `PORT` | No | `3001` | HTTP port |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `RABBITMQ_URL` | **Yes** | — | AMQP URL, e.g. `amqp://user:pass@host:5672` |
| `RABBITMQ_QUEUE_PROFILES` | No | `profile_service_queue` | Incoming queue name |
| `RABBITMQ_EXCHANGE_USERS` | No | `users_exchange` | Exchange to consume from |
| `RABBITMQ_EXCHANGE_PROFILES` | No | `profiles_exchange` | Exchange to publish to |
| `REDIS_HOST` | No | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password |
| `REDIS_TTL_SECONDS` | No | `3600` | Default cache TTL |
| `JWT_PUBLIC_KEY` | **Yes** | — | RSA PEM public key from Auth Service |
| `JWT_ALGORITHM` | No | `RS256` | JWT algorithm |
| `LOG_LEVEL` | No | `info` | `fatal`/`error`/`warn`/`info`/`debug`/`trace` |

## API Endpoints

All routes are prefixed with `/api/v1/`. Protected routes require `Authorization: Bearer <JWT>`.

### Profiles

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/profiles/me` | ✅ | Get own profile |
| `PATCH` | `/profiles/me` | ✅ | Update own profile base fields |
| `GET` | `/profiles/:userId` | ✅ | Get public profile by userId |

### Student Profiles

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/profiles/me/student` | ✅ | Get own student profile |
| `POST` | `/profiles/me/student` | ✅ | Create or update student profile |
| `POST` | `/profiles/me/student/languages` | ✅ | Add target language |
| `DELETE` | `/profiles/me/student/languages/:code` | ✅ | Remove target language |

### Tutor Profiles

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/profiles/me/tutor` | ✅ | Get own tutor profile |
| `POST` | `/profiles/me/tutor` | ✅ | Create or update tutor profile |
| `POST` | `/profiles/me/tutor/languages` | ✅ | Add teaching language |
| `POST` | `/profiles/me/tutor/qualifications` | ✅ | Add qualification |
| `GET` | `/tutors` | — | Search tutors (public) |

### Preferences

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/preferences/me` | ✅ | Get notification preferences |
| `PATCH` | `/preferences/me` | ✅ | Update notification preferences |

## RabbitMQ Events

### Consumed (from `users_exchange`)

| Routing Key | Payload | Action |
|---|---|---|
| `user.registered` | `{ userId, email, role, timestamp }` | Creates a new profile |
| `user.deleted` | `{ userId, timestamp }` | Soft-deletes the profile |

Event deduplication is handled via the `processed_events` table.

### Published (to `profiles_exchange`)

| Routing Key | Trigger |
|---|---|
| `profile.created` | After profile created from `user.registered` event |
| `profile.updated` | After `PATCH /profiles/me` |
| `student.profile.completed` | When student profile + at least one language set |
| `tutor.profile.completed` | When tutor profile + at least one language set |

## Running Tests

```bash
# Unit tests
npm test

# Unit tests with coverage
npm run test:cov

# Watch mode
npm run test:watch
```

## Database Commands

```bash
# Generate Prisma client after schema changes
npm run db:generate

# Create and apply a new migration (dev only)
npm run db:migrate

# Apply pending migrations (production)
npm run db:migrate:prod

# Open Prisma Studio (visual DB browser)
npm run db:studio
```
