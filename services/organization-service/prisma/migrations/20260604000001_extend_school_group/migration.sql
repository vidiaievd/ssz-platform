-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "GroupMode" AS ENUM ('online', 'in_person');

-- AlterTable
ALTER TABLE "school_groups"
  ADD COLUMN "status"       "GroupStatus" NOT NULL DEFAULT 'draft',
  ADD COLUMN "mode"         "GroupMode"   NOT NULL DEFAULT 'online',
  ADD COLUMN "course_id"    TEXT,
  ADD COLUMN "lang"         CHAR(2),
  ADD COLUMN "level"        TEXT,
  ADD COLUMN "capacity_min" INTEGER,
  ADD COLUMN "capacity_max" INTEGER,
  ADD COLUMN "start_date"   DATE,
  ADD COLUMN "end_date"     DATE;

-- CreateIndex
CREATE INDEX "school_groups_school_id_status_idx" ON "school_groups"("school_id", "status");
