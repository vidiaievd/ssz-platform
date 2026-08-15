-- The letter back to a learner whose submission a teacher has marked (plan 42).

ALTER TYPE "notification_type"
  ADD VALUE IF NOT EXISTS 'ATTEMPT_REVIEWED';
