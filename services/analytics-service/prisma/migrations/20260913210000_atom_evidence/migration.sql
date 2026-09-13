-- Plan 63 phase 3 — evidence about a fact, beside the existing evidence about an attempt.
--
-- `attempt_evidence` keeps its meaning of one row per attempt that moved a card: five
-- readers count its rows as attempts, and multiplying them by the number of addresses
-- would change every one of those numbers without anyone asking for it. The fine-grained
-- record goes in its own table, joined to the coarse one by event_id when needed.
ALTER TABLE "attempt_evidence" ADD COLUMN "modality" TEXT;

CREATE TABLE "atom_evidence" (
  "id"               TEXT NOT NULL,
  "event_id"         TEXT NOT NULL,
  "user_id"          TEXT NOT NULL,
  "exercise_id"      TEXT NOT NULL,
  "atom_type"        TEXT NOT NULL,
  "atom_id"          TEXT NOT NULL,
  "role"             TEXT,
  "item_key"         TEXT,
  "content_type"     TEXT,
  "modality"         TEXT,
  "rating_applied"   TEXT NOT NULL,
  "score"            INTEGER NOT NULL,
  "passed"           BOOLEAN,
  "stability_after"  DOUBLE PRECISION,
  "container_id"     TEXT,
  "group_id"         TEXT,
  "work_context"     TEXT,
  "occurred_at"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "atom_evidence_pkey" PRIMARY KEY ("id")
);

-- One rating is one observation about one atom; a single event legitimately writes
-- several rows, so the pair — not the event alone — is what a redelivery collides with.
CREATE UNIQUE INDEX "atom_evidence_event_id_atom_type_atom_id_key"
  ON "atom_evidence" ("event_id", "atom_type", "atom_id");

CREATE INDEX "atom_evidence_user_id_atom_type_atom_id_occurred_at_idx"
  ON "atom_evidence" ("user_id", "atom_type", "atom_id", "occurred_at");
CREATE INDEX "atom_evidence_atom_type_atom_id_occurred_at_idx"
  ON "atom_evidence" ("atom_type", "atom_id", "occurred_at");
CREATE INDEX "atom_evidence_user_id_modality_occurred_at_idx"
  ON "atom_evidence" ("user_id", "modality", "occurred_at");
