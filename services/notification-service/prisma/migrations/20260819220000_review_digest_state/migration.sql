-- What each reviewer was last told about their queue, so that a digest stays a digest
-- (plan 47.5): one message per run per teacher, and none at all when nothing new has
-- arrived since the last one.

ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'REVIEW_DIGEST';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'REVIEW_ESCALATION';

CREATE TABLE IF NOT EXISTS "review_digest_state" (
  "user_id"               TEXT         NOT NULL,
  "last_sent_at"          TIMESTAMP(3) NOT NULL,
  -- The newest submission the teacher has already been told about. A count would not do:
  -- work marked and work handed in between two runs can cancel out.
  "last_max_submitted_at" TIMESTAMP(3) NOT NULL,
  "last_escalated_at"     TIMESTAMP(3),
  "updated_at"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "review_digest_state_pkey" PRIMARY KEY ("user_id")
);
