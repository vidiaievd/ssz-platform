-- Ties a unit of the teaching plan to a unit of the linked course, so per-unit
-- progress can be shown against the course a student actually opens. Nullable
-- on purpose: a plan may be written before the course exists, or beside it.
ALTER TABLE "curriculum_units" ADD COLUMN "content_unit_id" TEXT;
