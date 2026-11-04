-- A `sound` atom can be an exercise target (plan 86, step 8.2). Its id is a natural key
-- (`nb:kj`), so atom_id stops being a uuid; existing uuids keep their text form, and the
-- polymorphic column has no FK to drop. The indexes on it are rebuilt by the type change.

ALTER TYPE "atom_type" ADD VALUE 'sound';

ALTER TABLE "exercise_item_targets" ALTER COLUMN "atom_id" TYPE TEXT USING "atom_id"::text;
