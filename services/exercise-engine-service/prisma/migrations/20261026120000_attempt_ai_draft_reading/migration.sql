-- Plan 82, step 7: the reading check behind a `voice_review` verdict, kept on its review.
ALTER TABLE "attempt_ai_drafts" ADD COLUMN "reading" JSONB;
