-- VoxOrd offline plan, B4 — the attempt was worked on a phone offline and replayed.
--
-- Defaulted to false: every attempt that exists today was made online, and the flag is
-- read to measure offline use, where an unknown would have to be counted as one or other.
ALTER TABLE "attempts" ADD COLUMN "recorded_offline" BOOLEAN NOT NULL DEFAULT false;
