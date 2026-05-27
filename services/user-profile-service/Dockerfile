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

# Mirror monorepo layout so file:../../packages/contracts resolves within /workspace
COPY --from=contracts-builder /workspace/packages/contracts/package.json /workspace/packages/contracts/package.json
COPY --from=contracts-builder /workspace/packages/contracts/dist         /workspace/packages/contracts/dist

WORKDIR /workspace/services/user-profile-service

COPY services/user-profile-service/package*.json ./

# --install-links: install file: deps as regular copies, not symlinks
RUN npm ci --install-links

COPY services/user-profile-service/tsconfig*.json services/user-profile-service/nest-cli.json ./
COPY services/user-profile-service/prisma/ ./prisma/
COPY services/user-profile-service/src/ ./src/

RUN npx prisma generate
RUN npm run build
RUN if [ "$NODE_ENV" = "production" ]; then npm prune --production; fi

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ARG NODE_ENV=development
ENV NODE_ENV=$NODE_ENV

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/services/user-profile-service/node_modules ./node_modules
COPY --from=builder /workspace/services/user-profile-service/dist         ./dist
COPY --from=builder /workspace/services/user-profile-service/generated    ./generated
COPY --from=builder /workspace/services/user-profile-service/prisma       ./prisma
COPY services/user-profile-service/prisma.config.ts ./
COPY services/user-profile-service/package.json services/user-profile-service/tsconfig.json ./

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && node dist/src/main.js"]
