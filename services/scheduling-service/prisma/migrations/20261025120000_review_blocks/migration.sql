-- Time a teacher keeps for marking learners' work (plan 81). A table of its own
-- rather than a lesson without a group: every lesson reader (log, delivery,
-- reminders, substitutions) stays blind to it by construction.
CREATE TYPE "review_block_repeat" AS ENUM ('one_off', 'weekly');

CREATE TABLE "review_blocks" (
  "id" TEXT NOT NULL,
  "school_id" TEXT NOT NULL,
  "teacher_id" TEXT NOT NULL,
  "repeat" "review_block_repeat" NOT NULL,
  -- A weekly series falls on the weekday of its first day; the weekday is not
  -- stored, so it cannot disagree with the date.
  "starts_on" DATE NOT NULL,
  -- Inclusive. Equals starts_on for a one-off; null is a series with no end.
  "ends_on" DATE,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "note" TEXT,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "review_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "review_blocks_teacher_id_starts_on_idx" ON "review_blocks"("teacher_id", "starts_on");
CREATE INDEX "review_blocks_school_id_starts_on_idx" ON "review_blocks"("school_id", "starts_on");

-- One occurrence of a series taken out without touching the rule.
CREATE TABLE "review_block_skips" (
  "block_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_block_skips_pkey" PRIMARY KEY ("block_id", "date")
);

ALTER TABLE "review_block_skips"
  ADD CONSTRAINT "review_block_skips_block_id_fkey"
  FOREIGN KEY ("block_id") REFERENCES "review_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
