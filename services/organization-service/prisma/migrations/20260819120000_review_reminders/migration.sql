-- One reminder per reviewer per day (plan 46 §46.4), mirroring `student_nudges`.
-- Written by hand for the same reason as the review settings migration: the dev
-- database carries drift a generated migration would ask to reset.

CREATE TABLE "reviewer_reminders" (
  "school_id" UUID NOT NULL,
  "teacher_id" TEXT NOT NULL,
  "last_reminded_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reviewer_reminders_pkey" PRIMARY KEY ("school_id", "teacher_id")
);
