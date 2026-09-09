-- review_claimed_at was created without a time zone, unlike reviewed_at next to it.
-- The column carries an expiry the whole review flow compares against now(), so it
-- follows the reviewed_at convention rather than the older columns' (plan 44 §1).
ALTER TABLE "attempts"
  ALTER COLUMN "review_claimed_at" TYPE TIMESTAMPTZ USING "review_claimed_at" AT TIME ZONE 'UTC';
