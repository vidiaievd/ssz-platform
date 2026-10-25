-- Minutes per submission a school expects, by template (plan 81, Q5): only what the
-- school set — a template it never touched follows the factory value in code. Written by
-- hand, like the other review settings: the dev database carries drift from older migrations.

ALTER TABLE "schools"
  ADD COLUMN "review_effort_minutes" JSONB NOT NULL DEFAULT '{}';
