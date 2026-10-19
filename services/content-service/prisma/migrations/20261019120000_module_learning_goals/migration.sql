-- Plan 39, B5: a module states its learning goals. An empty array, not NULL, for
-- every existing row: "no goals written yet" has one spelling only.
ALTER TABLE "containers" ADD COLUMN "learning_goals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
