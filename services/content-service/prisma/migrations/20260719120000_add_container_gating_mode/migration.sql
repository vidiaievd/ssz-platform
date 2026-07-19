-- CreateEnum
CREATE TYPE "gating_mode" AS ENUM ('open', 'sequential');

-- AlterTable
ALTER TABLE "containers" ADD COLUMN     "gating_mode" "gating_mode" NOT NULL DEFAULT 'open';
