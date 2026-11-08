-- Plan 86, step 13.4c: where a pronunciation session (`sound_session`) stands.
ALTER TABLE "attempts" ADD COLUMN "session_state" JSONB;
