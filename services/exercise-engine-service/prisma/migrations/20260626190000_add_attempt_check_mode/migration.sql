-- CreateEnum
CREATE TYPE "check_mode" AS ENUM ('practice', 'graded');

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN "check_mode" "check_mode" NOT NULL DEFAULT 'practice';
ALTER TABLE "attempts" ADD COLUMN "practiced_atoms" JSONB NOT NULL DEFAULT '[]';
