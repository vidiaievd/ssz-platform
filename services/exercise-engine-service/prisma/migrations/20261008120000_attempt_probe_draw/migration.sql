-- Plan 72 — the probes a `minimal_pairs` sitting draws at its start.
--
-- Nullable and defaultless, like `picked_options` beside it: every attempt that exists today
-- belongs to a template that draws nothing, and "no draw" is a different statement from an
-- empty one.
ALTER TABLE "attempts" ADD COLUMN "probe_draw" JSONB;
