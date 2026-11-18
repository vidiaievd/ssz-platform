-- A course's maintenance status (plan 90, phase 5, step 4a; Q5): `maintained` by default,
-- `unmaintained` (still in the catalogue, with a badge) and `obsolete` (out of the catalogue,
-- no new enrolments; its learners carry on). Set by the author by hand, or by the owning
-- school's lifecycle (step 4b). `owner_school_name` keeps the byline once the school is gone.

CREATE TYPE "maintenance_status" AS ENUM ('maintained', 'unmaintained', 'obsolete');
CREATE TYPE "maintenance_source" AS ENUM ('author', 'school');

ALTER TABLE "containers"
    ADD COLUMN "maintenance_status" "maintenance_status" NOT NULL DEFAULT 'maintained',
    ADD COLUMN "maintenance_source" "maintenance_source",
    ADD COLUMN "maintenance_changed_at" TIMESTAMPTZ,
    ADD COLUMN "owner_school_name" VARCHAR(200);

CREATE INDEX "containers_maintenance_status_idx" ON "containers"("maintenance_status");
