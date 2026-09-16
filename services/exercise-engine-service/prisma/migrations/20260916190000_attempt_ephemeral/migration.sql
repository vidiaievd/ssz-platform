-- Plan 63 phase 9 — the attempt remembers that its task was disposable.
--
-- A default rather than NULL, as with the axes and the addresses: every attempt that
-- exists today was on a catalogue exercise, so `false` is a true statement about all of
-- them and no backfill can improve on it.
ALTER TABLE "attempts" ADD COLUMN "ephemeral" BOOLEAN NOT NULL DEFAULT false;
