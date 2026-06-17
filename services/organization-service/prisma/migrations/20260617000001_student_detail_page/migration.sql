-- CreateEnum
CREATE TYPE "group_member_role" AS ENUM ('student', 'trial', 'observer');

-- CreateEnum
CREATE TYPE "group_membership_status" AS ENUM ('active', 'past');

-- CreateEnum
CREATE TYPE "student_status" AS ENUM ('active', 'archived');

-- AlterTable
ALTER TABLE "school_group_members" ADD COLUMN     "exited_at" TIMESTAMP(3),
ADD COLUMN     "role" "group_member_role" NOT NULL DEFAULT 'student',
ADD COLUMN     "status" "group_membership_status" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "school_members" ADD COLUMN     "level" TEXT,
ADD COLUMN     "status" "student_status" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "student_level_history" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "group_id" UUID,
    "assessed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_level_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_level_history_school_id_student_id_idx" ON "student_level_history"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "school_group_members_group_id_status_idx" ON "school_group_members"("group_id", "status");
