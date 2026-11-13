-- Plan 90, phase 4, step 3: an auto-approved application that found no student seat stays
-- pending in the school's manual queue, marked with why.
ALTER TABLE "school_memberships" ADD COLUMN "blocked_reason" VARCHAR(32);
