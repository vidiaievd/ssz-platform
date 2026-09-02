-- Plan 55 §4.3 — the axes and the stability, next to the form the answer was given in.
--
-- Empty arrays rather than NULL, matching the engine's columns: Prisma cannot express a
-- nullable list. A row from before the axes existed therefore reads as empty, and the
-- profile leaves it out of every cell rather than counting it into a default one.
ALTER TABLE "attempt_evidence" ADD COLUMN "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "attempt_evidence" ADD COLUMN "focus" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "attempt_evidence" ADD COLUMN "stability_after" DOUBLE PRECISION;
