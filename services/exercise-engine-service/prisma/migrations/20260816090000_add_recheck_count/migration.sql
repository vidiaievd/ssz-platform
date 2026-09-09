-- Separate the two counters that used to share `revision_count`:
-- `recheck_count` counts re-checks of the same attempt (only the first check is
-- evidence for progress/SRS), while `revision_count` now means which resubmission
-- after a RETURNED verdict this attempt is (plan 44 §1).
ALTER TABLE "attempts" ADD COLUMN "recheck_count" INTEGER NOT NULL DEFAULT 0;

-- Existing rows: whatever revision_count held was a re-check tally, since no
-- resubmission flow existed before this plan.
UPDATE "attempts" SET "recheck_count" = "revision_count";
UPDATE "attempts" SET "revision_count" = 0;
