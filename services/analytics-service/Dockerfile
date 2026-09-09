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

# ── Stage 1b: build shared kernel ─────────────────────────────────────────────
# The mastery arithmetic and the evidence table it reads live there (plan 55 §5.1), so
# that the weights are the same judgement the scheduler clamps by, not a second copy.
FROM node:22-bookworm-slim AS kernel-builder

WORKDIR /workspace/packages/shared-kernel

COPY packages/shared-kernel/package*.json ./
RUN npm ci
COPY packages/shared-kernel/src ./src
COPY packages/shared-kernel/tsconfig.json ./
RUN npm run build

# ── Stage 2: build service ────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
ARG NODE_ENV=development

COPY --from=contracts-builder /workspace/packages/contracts/package.json /workspace/packages/contracts/package.json
COPY --from=contracts-builder /workspace/packages/contracts/dist         /workspace/packages/contracts/dist
COPY --from=kernel-builder /workspace/packages/shared-kernel/package.json /workspace/packages/shared-kernel/package.json
COPY --from=kernel-builder /workspace/packages/shared-kernel/dist         /workspace/packages/shared-kernel/dist

WORKDIR /workspace/services/analytics-service

COPY services/analytics-service/package*.json ./

# --install-links: install file: deps as regular copies, not symlinks
# npm install instead of npm ci: npm 10 records the wasm32-only @unrs/resolver-binding-wasm32-wasi
# in the lockfile but omits its deps (@emnapi/core, @emnapi/runtime) since they're never
# installed on amd64 — npm ci rejects that inconsistency, npm install does not.
RUN npm install --install-links

COPY services/analytics-service/tsconfig*.json services/analytics-service/nest-cli.json ./
COPY services/analytics-service/prisma/ ./prisma/
COPY services/analytics-service/src/ ./src/

RUN npx prisma generate
RUN npm run build
RUN if [ "$NODE_ENV" = "production" ]; then npm prune --production; fi

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ARG NODE_ENV=development
ENV NODE_ENV=$NODE_ENV

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/services/analytics-service/node_modules ./node_modules
COPY --from=builder /workspace/services/analytics-service/dist         ./dist
COPY --from=builder /workspace/services/analytics-service/generated    ./generated
COPY --from=builder /workspace/services/analytics-service/prisma       ./prisma
COPY services/analytics-service/prisma.config.ts ./
COPY services/analytics-service/package.json services/analytics-service/tsconfig.json ./

EXPOSE 3008

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/src/main.js"]
