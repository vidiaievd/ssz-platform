-- The group a solo workspace provisions for itself, told apart from the groups a tutor
-- creates by hand (plan 59 §5). Until now "the default group" meant "the first row the
-- query happened to return", which stops being true the moment a tutor has two.
ALTER TABLE "school_groups" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- Every solo workspace has exactly one group today: that one is the default.
UPDATE "school_groups" g
SET "is_default" = true
FROM "schools" s
WHERE g."school_id" = s."id"
  AND s."kind" = 'SOLO'
  AND g."deleted_at" IS NULL;

-- One default per workspace, for as long as it is alive.
CREATE UNIQUE INDEX "school_groups_default_per_school"
  ON "school_groups" ("school_id")
  WHERE "is_default" AND "deleted_at" IS NULL;
