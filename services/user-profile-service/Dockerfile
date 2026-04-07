# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first to leverage Docker layer cache
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for the build step)
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and compile TypeScript
COPY tsconfig*.json ./
COPY src ./src

RUN npm run build

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user to run the application
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev

# Generate Prisma client in the production image
RUN npx prisma generate

# Copy compiled output from the builder stage
COPY --from=builder /app/dist ./dist

# Transfer ownership to the non-root user
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3001

# Run DB migrations then start the application
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
