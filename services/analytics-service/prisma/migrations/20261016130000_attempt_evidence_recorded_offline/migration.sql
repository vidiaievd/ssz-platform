-- VoxOrd offline plan, B4 — the rated attempt was worked on a phone offline and replayed.
--
-- Defaulted to false: before the engine dated replayed attempts, none reached this table
-- marked, and the flag is read to measure offline use.
ALTER TABLE "attempt_evidence" ADD COLUMN "recorded_offline" BOOLEAN NOT NULL DEFAULT false;
