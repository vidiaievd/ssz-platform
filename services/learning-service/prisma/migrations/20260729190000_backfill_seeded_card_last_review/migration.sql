-- Cards seeded as "already known" (skip-known paths) were created directly in
-- the review state with no last_reviewed_at, leaving FSRS without a reference
-- point for the forgetting curve. ts-fsrs >= 5.4.0 rejects that outright, which
-- made the course-mastery query fail for any learner who had used the feature.
-- The seed itself is the pseudo-review, so creation time is the correct anchor.
UPDATE "srs_review_cards"
SET "last_reviewed_at" = "created_at"
WHERE "last_reviewed_at" IS NULL
  AND "state" <> 'new';
