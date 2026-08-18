-- A course may promise a faster answer than its school does; null keeps the school's
-- promise, which is why the column is nullable rather than defaulted (plan 44 §44.12).

ALTER TABLE "containers"
  ADD COLUMN "review_respond_within_hours" INTEGER;
