-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'TEACHER_ABSENCE';
ALTER TYPE "notification_type" ADD VALUE 'SUBSTITUTE_REQUEST';
ALTER TYPE "notification_type" ADD VALUE 'SUBSTITUTE_ASSIGNED';
ALTER TYPE "notification_type" ADD VALUE 'OVERLOAD_ALERT';
ALTER TYPE "notification_type" ADD VALUE 'VACANCY_ALERT';
ALTER TYPE "notification_type" ADD VALUE 'UNCOVERED_LESSON';

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "read_at" SET DATA TYPE TIMESTAMP(3);
