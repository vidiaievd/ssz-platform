-- Plan 55 §3.6 — what the attempt exercised, snapshotted at its start.
-- Empty arrays rather than NULL: Prisma cannot express a nullable list, and an attempt
-- started before the axes existed reports nothing rather than reporting a guess.
ALTER TABLE "attempts" ADD COLUMN "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "attempts" ADD COLUMN "focus" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
