-- A workspace is either a school or one private tutor's solo space (plan 59, variant B).
-- Every existing row is a school; SOLO rows are only ever created by provisioning.
CREATE TYPE "school_kind" AS ENUM ('SCHOOL', 'SOLO');

ALTER TABLE "schools" ADD COLUMN "kind" "school_kind" NOT NULL DEFAULT 'SCHOOL';
