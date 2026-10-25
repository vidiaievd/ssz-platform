-- School work closed by a model's verdict at the school's term, and a teacher's later verdict on it (plan 80, step 6a).

CREATE TABLE "review_term_acceptances" (
    "attempt_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "group_id" TEXT,
    "container_id" TEXT,
    "user_id" TEXT,
    "exercise_id" TEXT,
    "template_code" TEXT,
    "capability" TEXT,
    "model_id" TEXT,
    "prompt_version" TEXT,
    "ai_outcome" TEXT,
    "accepted_at" TIMESTAMP(3),
    "revised_by" TEXT,
    "revised_at" TIMESTAMP(3),
    "revised_outcome" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_term_acceptances_pkey" PRIMARY KEY ("attempt_id")
);

CREATE INDEX "review_term_acceptances_school_id_accepted_at_idx" ON "review_term_acceptances"("school_id", "accepted_at");

CREATE INDEX "review_term_acceptances_revised_by_revised_at_idx" ON "review_term_acceptances"("revised_by", "revised_at");
