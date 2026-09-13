-- A learner is told once about a lesson: the job runs on a timer, and a rerun must not
-- write to the same person about the same lesson twice (plan 62).
ALTER TYPE "notification_type" ADD VALUE 'LESSON_REMINDER';

CREATE TABLE "lesson_reminders" (
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_reminders_pkey" PRIMARY KEY ("session_id","user_id")
);

CREATE INDEX "lesson_reminders_sent_at_idx" ON "lesson_reminders"("sent_at");
