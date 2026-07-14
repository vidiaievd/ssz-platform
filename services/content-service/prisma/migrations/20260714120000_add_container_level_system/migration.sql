-- CreateEnum
CREATE TYPE "level_system" AS ENUM ('cefr', 'custom', 'single');

-- AlterTable
ALTER TABLE "containers" ADD COLUMN     "level_system" "level_system" NOT NULL DEFAULT 'cefr';
