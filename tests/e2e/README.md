# E2E Integration Tests

Cross-service integration tests using Jest + Testcontainers. Each scenario boots
real infrastructure (Postgres, Redis, RabbitMQ) and the required NestJS services
in Docker containers, then tears everything down after the suite finishes.

## Prerequisites

- Docker Engine running locally
- Node.js 22+
- npm

## First-time setup

```bash
# 1. Build the shared contracts package
cd packages/contracts && npm install && npm build && cd ../..

# 2. Build the services under test
cd services/learning-service && npm run build && cd ../..
cd services/exercise-engine-service && npm run build && cd ../..

# 3. Install e2e workspace dependencies
cd tests/e2e && npm install
```

## Running the tests

```bash
# From tests/e2e/
npm test:e2e

# With verbose output
npm test:e2e:verbose

# Single scenario
npm test:e2e -- --testPathPattern="01-closed-form"
```

## How it works

### Infrastructure containers

Started with Testcontainers before each scenario's `beforeAll`:

| Container  | Image                           | Purpose                      |
|------------|---------------------------------|------------------------------|
| Postgres   | `postgres:16-alpine`            | Per-scenario isolated DB     |
| RabbitMQ   | `rabbitmq:3-management-alpine`  | Event broker                 |
| Redis      | `redis:7-alpine`                | Cache, BullMQ queues         |

### Services

NestJS services run as **Node.js child processes** (not in Docker) so that startup
is fast and no image build is required during the test run. Each scenario:
1. Creates a fresh database in the Testcontainers Postgres instance.
2. Calls `npx prisma migrate deploy` to apply the schema.
3. Spawns `node dist/main.js` with env vars pointing to the container ports.
4. Waits for `GET /health/live` to return < 500 before proceeding.

Services must be **pre-built** before running e2e tests:
```bash
cd services/learning-service  && npm run build && cd ../..
cd services/exercise-engine-service && npm run build && cd ../..
```

### Stub servers

Content Service and Organization Service are replaced by minimal in-process HTTP
stubs (`helpers/stub-server.ts`) running on random host ports. Each scenario
registers only the routes it needs; unregistered routes return `200 {}`.

### Helpers

| File                  | Purpose                                              |
|-----------------------|------------------------------------------------------|
| `helpers/infra.ts`    | Start/stop Postgres, Redis, RabbitMQ containers      |
| `helpers/services.ts` | Spawn NestJS services as Node processes              |
| `helpers/stub-server.ts` | In-process HTTP stub for Content / Org services  |
| `helpers/jwt.ts`      | Generate RSA key pair + sign test tokens             |
| `helpers/amqp.ts`     | Capture events (`waitFor`) and publish to exchange   |
| `helpers/db.ts`       | Direct Postgres queries for DB-level assertions      |
| `helpers/http.ts`     | Axios factory pre-configured with service base URLs  |

### Authentication in tests

Each scenario calls `createJwtHelper()` which generates a fresh RSA-2048 key
pair. The public key is passed as `JWT_PUBLIC_KEY` to the service processes and
tokens are signed with the private key using `jsonwebtoken`. The service JWT
verifier accepts RS256 tokens normally — no bypass needed.

## Timeouts

- Per-test timeout: 5 minutes (configured in `jest.e2e.config.ts`)
- Service startup timeout: 2 minutes (includes Docker build + migrate deploy)

Typical run time per scenario: 60–120 seconds depending on Docker cache warmth.

## CI integration

E2E tests are **not** included in the default `pnpm test` script for any service.
They run opt-in, from this workspace only:

```bash
cd tests/e2e && pnpm test:e2e
```

Add to CI as a separate job that runs after unit tests pass, with Docker-in-Docker
or a Docker socket mounted.

## Troubleshooting

**"Cannot connect to Docker"** — ensure Docker Desktop / Engine is running.

**Build fails with `@ssz/contracts` not found** — run `pnpm build` in
`packages/contracts` first (see First-time setup).

**Service fails to start (timeout)** — check the container logs:
```bash
# Testcontainers prints container IDs in the test output.
docker logs <container-id>
```

**Port conflicts** — Testcontainers assigns random host ports; conflicts are
unlikely but possible if another test run is active. Use `--runInBand` (default).
