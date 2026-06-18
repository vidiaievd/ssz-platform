-- AlterEnum: add TEACHER_PROFILE_CHANGED to notification_type
ALTER TYPE "notification_type" ADD VALUE 'TEACHER_PROFILE_CHANGED';

-- AlterTable: add isRead/readAt fields
ALTER TABLE "notifications"
  ADD COLUMN "is_read" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "read_at" TIMESTAMPTZ;

-- CreateIndex: for in-app feed queries
CREATE INDEX "notifications_recipient_id_is_read_idx" ON "notifications"("recipient_id", "is_read");
