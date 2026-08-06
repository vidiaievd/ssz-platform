# Build context: repo root (ssz-platform/)
# Required because @ssz/contracts and @ssz/shared-kernel are local file: dependencies.

# ── Stage 1: build contracts ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS contracts-builder

WORKDIR /workspace/packages/contracts

COPY packages/contracts/package*.json ./
RUN npm ci
COPY packages/contracts/src ./src
COPY packages/contracts/tsconfig.json ./
RUN npm run build

# ── Stage 2: build shared kernel ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS kernel-builder

WORKDIR /workspace/packages/shared-kernel

COPY packages/shared-kernel/package*.json ./
RUN npm ci
COPY packages/shared-kernel/src ./src
COPY packages/shared-kernel/tsconfig.json ./
RUN npm run build

# ── Stage 3: build service ────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
ARG NODE_ENV=development

# Mirror monorepo layout so file:../../packages/* resolve within /workspace
COPY --from=contracts-builder /workspace/packages/contracts/package.json /workspace/packages/contracts/package.json
COPY --from=contracts-builder /workspace/packages/contracts/dist         /workspace/packages/contracts/dist
COPY --from=kernel-builder /workspace/packages/shared-kernel/package.json /workspace/packages/shared-kernel/package.json
COPY --from=kernel-builder /workspace/packages/shared-kernel/dist         /workspace/packages/shared-kernel/dist

WORKDIR /workspace/services/exercise-engine-service

COPY services/exercise-engine-service/package*.json ./
COPY services/exercise-engine-service/package-lock.json ./

# --install-links: install file: deps as regular copies, not symlinks
RUN npm ci --install-links

COPY services/exercise-engine-service/tsconfig*.json ./
COPY services/exercise-engine-service/prisma/ ./prisma/
COPY services/exercise-engine-service/src/ ./src/

RUN npx prisma generate
RUN npm run build
RUN if [ "$NODE_ENV" = "production" ]; then npm prune --production; fi

# ── Stage 4: runtime ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ARG NODE_ENV=development
ENV NODE_ENV=$NODE_ENV

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/services/exercise-engine-service/node_modules ./node_modules
COPY --from=builder /workspace/services/exercise-engine-service/dist         ./dist
COPY --from=builder /workspace/services/exercise-engine-service/generated    ./generated
COPY --from=builder /workspace/services/exercise-engine-service/prisma       ./prisma
COPY services/exercise-engine-service/prisma.config.ts ./
COPY services/exercise-engine-service/package.json services/exercise-engine-service/tsconfig.json ./

EXPOSE 3006

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/src/main.js"]
