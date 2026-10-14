-- Plan 74: synthesized assets carry their origin and synthesis metadata; a replaced
-- narration is marked superseded instead of being deleted at once (decision D5).
CREATE TYPE "asset_origin" AS ENUM ('UPLOAD', 'SYNTHESIZED');

ALTER TABLE "media_assets" ADD COLUMN "origin" "asset_origin" NOT NULL DEFAULT 'UPLOAD';
ALTER TABLE "media_assets" ADD COLUMN "synthesis" JSONB;
ALTER TABLE "media_assets" ADD COLUMN "superseded_at" TIMESTAMP(3);
ALTER TABLE "media_assets" ADD COLUMN "superseded_by" TEXT;
