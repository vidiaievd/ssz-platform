# Build context: repo root (ssz-platform/)
# Required because @ssz/contracts is a local file: dependency.

# ── Stage 1: build contracts ───────────────────────────────────────────────────
FROM node:22-bookworm-slim AS contracts-builder

WORKDIR /workspace/packages/contracts

COPY packages/contracts/package*.json ./
RUN npm ci
COPY packages/contracts/src ./src
COPY packages/contracts/tsconfig.json ./
RUN npm run build

# ── Stage 2: build service ────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
ARG NODE_ENV=development

COPY --from=contracts-builder /workspace/packages/contracts/package.json /workspace/packages/contracts/package.json
COPY --from=contracts-builder /workspace/packages/contracts/dist         /workspace/packages/contracts/dist

WORKDIR /workspace/services/scheduling-service

COPY services/scheduling-service/package*.json ./

RUN npm install --install-links

COPY services/scheduling-service/tsconfig*.json services/scheduling-service/nest-cli.json ./
COPY services/scheduling-service/prisma/ ./prisma/
COPY services/scheduling-service/src/ ./src/

RUN npx prisma generate
RUN npm run build
RUN if [ "$NODE_ENV" = "production" ]; then npm prune --production; fi

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ARG NODE_ENV=development
ENV NODE_ENV=$NODE_ENV

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/services/scheduling-service/node_modules ./node_modules
COPY --from=builder /workspace/services/scheduling-service/dist         ./dist
COPY --from=builder /workspace/services/scheduling-service/generated    ./generated
COPY --from=builder /workspace/services/scheduling-service/prisma       ./prisma
COPY services/scheduling-service/prisma.config.ts ./
COPY services/scheduling-service/package.json services/scheduling-service/tsconfig.json ./

EXPOSE 3009

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/src/main.js"]
