-- ─── attempt_evidence.reviewed_by (plan 79 §2.1) ────────────────────────────────
-- `ai` when the rated verdict was a model's, on the work of a learner nobody reviews.
-- The mastery profile and the group screens weigh such a row by the kernel's
-- `reviewedBy` rule, the one that clamped its rating. Null for every existing row:
-- before plan 79 every reviewed verdict was a teacher's.

ALTER TABLE "attempt_evidence" ADD COLUMN "reviewed_by" TEXT;
