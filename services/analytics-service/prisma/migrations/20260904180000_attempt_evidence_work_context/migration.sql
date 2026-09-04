-- Where each piece of evidence came from: in class, as homework, or on the learner's
-- own time, and for which group and course. Nullable and not backfilled — the events
-- already recorded never carried this, and filling it in now would invent the answer
-- the column exists to measure.
ALTER TABLE "attempt_evidence" ADD COLUMN "work_context" TEXT;
ALTER TABLE "attempt_evidence" ADD COLUMN "group_id" TEXT;
ALTER TABLE "attempt_evidence" ADD COLUMN "container_id" TEXT;
ALTER TABLE "attempt_evidence" ADD COLUMN "lesson_id" TEXT;

CREATE INDEX "attempt_evidence_group_id_work_context_occurred_at_idx"
  ON "attempt_evidence" ("group_id", "work_context", "occurred_at");
