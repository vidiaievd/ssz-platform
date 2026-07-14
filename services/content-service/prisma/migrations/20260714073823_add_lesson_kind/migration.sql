-- CreateEnum
CREATE TYPE "lesson_kind" AS ENUM ('text', 'video', 'audio', 'live');

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "kind" "lesson_kind" NOT NULL DEFAULT 'text';
