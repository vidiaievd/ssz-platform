-- What a lesson is expected to train — plan 64, phase 10 (decisions L–Q).
--
-- A recipe is a short list of rules over the skill axes ("at least one element with an
-- output", "no more than 60 % recognition"), checked against every lesson of a course and
-- reported as warnings — never a gate on publishing. It lives on the workspace as a
-- standard and on the course as an override.
--
-- JSON rather than rows: the vocabulary of the rules is the shared kernel's, and a table
-- per axis would make every new axis value a migration in this service.

-- AlterTable: null inherits the workspace's recipe; an empty one opts out of it.
ALTER TABLE "containers" ADD COLUMN "coverage_recipe" JSONB;

-- CreateTable: keyed by organization-service's school id, SCHOOL and SOLO alike.
CREATE TABLE "workspace_coverage_recipes" (
    "school_id" UUID NOT NULL,
    "recipe" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by_user_id" UUID NOT NULL,

    CONSTRAINT "workspace_coverage_recipes_pkey" PRIMARY KEY ("school_id")
);
