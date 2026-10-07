-- Plan 70: audio assets carry their measured length and a normalised waveform.
ALTER TABLE "media_assets" ADD COLUMN "duration_ms" INTEGER;
ALTER TABLE "media_assets" ADD COLUMN "peaks" JSONB;
