-- The school's own weekly picture of its marking queue, sent to whoever the school named
-- in `escalateTo` (plan 47.6). A different message from a teacher's digest: it answers
-- "is our marking keeping up", not "what should I mark today".

ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'REVIEW_SCHOOL_SUMMARY';
