# Build context: repo root (ssz-platform/)
# Required because @ssz/contracts and @ssz/messaging are local file: dependencies.

# ── Stage 1: build contracts ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS contracts-builder

WORKDIR /workspace/packages/contracts

COPY packages/contracts/package*.json ./
RUN npm ci
COPY packages/contracts/src ./src
COPY packages/contracts/tsconfig.json ./
RUN npm run build

# ── Stage 2: build messaging ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS messaging-builder

COPY --from=contracts-builder /workspace/packages/contracts/package.json /workspace/packages/contracts/package.json
COPY --from=contracts-builder /workspace/packages/contracts/dist         /workspace/packages/contracts/dist

WORKDIR /workspace/packages/messaging

COPY packages/messaging/package*.json ./
RUN npm install --install-links
COPY packages/messaging/src ./src
COPY packages/messaging/tsconfig.json ./
RUN npm run build

# ── Stage 3: build service ────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
ARG NODE_ENV=development
# Prisma 7 loads prisma.config.ts (which calls env('DATABASE_URL')) even during generate.
# A placeholder satisfies the config loader — no real DB connection is made at build time.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DATABASE_URL=$DATABASE_URL

# Mirror monorepo layout so file: deps resolve within /workspace
COPY --from=contracts-builder /workspace/packages/contracts/package.json /workspace/packages/contracts/package.json
COPY --from=contracts-builder /workspace/packages/contracts/dist         /workspace/packages/contracts/dist
COPY --from=messaging-builder /workspace/packages/messaging/package.json /workspace/packages/messaging/package.json
COPY --from=messaging-builder /workspace/packages/messaging/dist         /workspace/packages/messaging/dist

WORKDIR /workspace/services/scheduling-service

COPY services/scheduling-service/package*.json ./

RUN npm install --install-links

COPY services/scheduling-service/tsconfig*.json services/scheduling-service/nest-cli.json services/scheduling-service/prisma.config.ts ./
COPY services/scheduling-service/prisma/ ./prisma/
COPY services/scheduling-service/src/ ./src/

RUN npx prisma generate
RUN npm run build
RUN if [ "$NODE_ENV" = "production" ]; then npm prune --production; fi

# ── Stage 4: runtime ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ARG NODE_ENV=development
ENV NODE_ENV=$NODE_ENV

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/services/scheduling-service/node_modules  ./node_modules
COPY --from=builder /workspace/services/scheduling-service/dist          ./dist
COPY --from=builder /workspace/services/scheduling-service/generated     ./generated
COPY --from=builder /workspace/services/scheduling-service/prisma        ./prisma
COPY --from=builder /workspace/services/scheduling-service/prisma.config.ts ./
COPY --from=builder /workspace/services/scheduling-service/package.json  ./
COPY --from=builder /workspace/services/scheduling-service/tsconfig.json ./

EXPOSE 3009

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/src/main.js"]
