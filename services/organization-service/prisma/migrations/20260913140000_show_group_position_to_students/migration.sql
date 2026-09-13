-- Whether a learner of this school is told where they stand in their group (plan 58,
-- screen F). Default true: the sentence they see carries a band and nothing else — no
-- rank, no percentile, no classmate's number — and a school that would rather not
-- compare at all turns it off.
ALTER TABLE "schools"
  ADD COLUMN "show_group_position_to_students" BOOLEAN NOT NULL DEFAULT true;
