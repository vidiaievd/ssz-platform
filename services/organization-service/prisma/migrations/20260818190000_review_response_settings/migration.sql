-- The response time a school promises a learner, and what happens when it passes
-- (plan 44 §44.12). Written by hand rather than generated: the dev database carries
-- drift from older migrations, and a generated migration would have asked to reset it.

CREATE TYPE "ReviewEscalationTarget" AS ENUM ('school_admins', 'owner', 'primary_teacher');

ALTER TABLE "schools"
  ADD COLUMN "review_respond_within_hours" INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN "review_escalate_after_hours" INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN "review_escalate_to" "ReviewEscalationTarget" NOT NULL DEFAULT 'school_admins';
