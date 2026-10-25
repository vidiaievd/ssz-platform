-- The term job's scan (plan 80, step 4): school work in review with a model's provisional
-- verdict, by when it counts by itself. Partial — everything else never matches.

CREATE INDEX "attempts_ai_verdict_due"
  ON "attempts" ("review_auto_accept_at")
  WHERE "status" = 'routed_for_review' AND "review_ai_verdict" IS NOT NULL;
