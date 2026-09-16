-- Plan 63 phase 9 — the disposable half of the platform.
--
-- A probe is a task made for one learner, aimed at one atom, alive for a few hours. It
-- holds a whole exercise definition so that an attempt on it is an ordinary attempt, and
-- it lives here rather than in the catalogue because the catalogue is what authors
-- maintain: a month of generated questions filed beside their work would end their use
-- of it.
--
-- No foreign key to "attempts": the attempt names the probe through the same
-- `exercise_id` column a catalogue exercise uses, and that column points at two spaces
-- on purpose — the engine resolves the definition, not the database. A constraint here
-- would also outlive what it protects, since the probe is meant to be deleted while the
-- attempt it produced stays as evidence forever.
CREATE TABLE "probe_tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subject_atom_type" TEXT NOT NULL,
    "subject_atom_id" TEXT NOT NULL,
    "required_modality" TEXT NOT NULL,
    "template_code" TEXT NOT NULL,
    "target_language" TEXT NOT NULL,
    "difficulty_level" "difficulty_level" NOT NULL,
    "content" JSONB NOT NULL,
    "expected_answers" JSONB,
    "answer_check_settings" JSONB,
    "instruction" JSONB,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "focus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targets" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "promoted_exercise_id" TEXT,
    "promoted_at" TIMESTAMPTZ,

    CONSTRAINT "probe_tasks_pkey" PRIMARY KEY ("id")
);

-- What is open for one learner right now.
CREATE INDEX "probe_tasks_user_id_expires_at_idx" ON "probe_tasks"("user_id", "expires_at");
-- The sweep.
CREATE INDEX "probe_tasks_expires_at_idx" ON "probe_tasks"("expires_at");
