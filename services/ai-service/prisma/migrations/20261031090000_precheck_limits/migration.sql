-- What a rehearsal before hand-in was about, for its limits (plan 84, step 3): the exercise,
-- and the check its calls belong to (a reading aloud makes one call per passage).

ALTER TABLE "ai_calls" ADD COLUMN "exercise_id" TEXT,
ADD COLUMN "check_id" TEXT;

CREATE INDEX "ai_calls_payer_id_actor_user_id_surface_created_at_idx" ON "ai_calls"("payer_id", "actor_user_id", "surface", "created_at");
