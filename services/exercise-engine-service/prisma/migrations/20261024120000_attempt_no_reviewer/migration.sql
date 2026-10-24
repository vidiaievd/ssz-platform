-- Free-form work with nobody to review it (plan 79, step 2.1c): no school, and no model
-- the learner may ask. Such an attempt closes at submit instead of routing for review.

ALTER TYPE "attempt_status" ADD VALUE IF NOT EXISTS 'no_reviewer';
