-- A teacher is warned once that a model's provisional verdict is about to count by itself
-- at the school's term (plan 80, step 5): the job runs hourly, and a rerun must not warn the
-- same person about the same submission twice.
ALTER TYPE "notification_type" ADD VALUE 'REVIEW_TERM_WARNING';

CREATE TABLE "review_term_warnings" (
    "attempt_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_term_warnings_pkey" PRIMARY KEY ("attempt_id","user_id")
);

CREATE INDEX "review_term_warnings_sent_at_idx" ON "review_term_warnings"("sent_at");
