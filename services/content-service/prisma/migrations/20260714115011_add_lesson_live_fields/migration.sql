-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "live_capacity" INTEGER,
ADD COLUMN     "live_duration_minutes" INTEGER,
ADD COLUMN     "live_join_url" VARCHAR(500),
ADD COLUMN     "live_starts_at" TIMESTAMPTZ;
