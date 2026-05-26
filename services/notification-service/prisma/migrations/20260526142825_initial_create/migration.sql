-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('WELCOME_EMAIL', 'EMAIL_VERIFICATION', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'STUDY_REMINDER', 'GENERAL');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('EMAIL', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'PERMANENTLY_FAILED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "notification_type" NOT NULL,
    "channel" "notification_channel" NOT NULL DEFAULT 'EMAIL',
    "recipient_id" TEXT NOT NULL,
    "recipient_email" TEXT,
    "subject" TEXT,
    "template_key" TEXT NOT NULL,
    "template_data" JSONB NOT NULL DEFAULT '{}',
    "status" "notification_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_id_idx" ON "notifications"("recipient_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_event_id_key" ON "processed_events"("event_id");
