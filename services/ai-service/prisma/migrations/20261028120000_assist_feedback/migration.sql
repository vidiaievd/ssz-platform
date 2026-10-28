-- A learner's «helpful» / «not helpful» on an answer of the assistant (plan 83, step 7).

CREATE TABLE "assist_feedback" (
    "call_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assist_feedback_pkey" PRIMARY KEY ("call_id")
);

CREATE INDEX "assist_feedback_created_at_idx" ON "assist_feedback"("created_at");
