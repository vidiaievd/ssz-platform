-- CreateEnum
CREATE TYPE "AgeBand" AS ENUM ('kids', 'teens', 'adults');

-- AlterTable
ALTER TABLE "school_groups" ADD COLUMN "age_band" "AgeBand";
