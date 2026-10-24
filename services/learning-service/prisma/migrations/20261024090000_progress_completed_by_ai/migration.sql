-- ─── user_progress.completed_by_ai (plan 79 §2.1) ───────────────────────────────
-- A learner with nobody to review their work gets a model's verdict instead (decision Q1).
-- Progress counts it as a pass, and remembers that nobody but a model said so: the flag
-- is set by the first completion and cleared by any later pass from a person or the
-- machine check. Every existing row was completed by one of those, hence false.

ALTER TABLE "user_progress" ADD COLUMN "completed_by_ai" BOOLEAN NOT NULL DEFAULT false;
