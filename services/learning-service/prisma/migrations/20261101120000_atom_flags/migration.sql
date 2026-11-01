-- ─── atom_flags (plan 85, step 5) ──────────────────────────────────────────────
-- Rule atoms a check of the learner's work named (`exercise.feedback.atoms_flagged`), one row
-- per (learner, exercise, atom, source, UTC day). The unique key is the deduplication of
-- §1 rule 3: a second rehearsal the same day finds its row and changes nothing.

CREATE TABLE "atom_flags" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "atom_type" TEXT NOT NULL,
    "atom_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "in_exercise_targets" BOOLEAN NOT NULL,
    "outcome" TEXT NOT NULL,
    "flagged_on" DATE NOT NULL,
    "school_id" TEXT,
    "container_id" TEXT,
    "group_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atom_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "atom_flags_dedup_key"
    ON "atom_flags"("user_id", "exercise_id", "atom_type", "atom_id", "source", "flagged_on");

CREATE INDEX "atom_flags_user_id_atom_id_idx" ON "atom_flags"("user_id", "atom_id");
