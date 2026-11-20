-- A closed school's exercises leave learners' review queues until it is restored (plan 90, live
-- check step 7): the card is suspended and marked with the school and the state it had, so
-- `content.school.study_resumed` brings back exactly these cards and nothing a learner suspended.

ALTER TABLE "srs_review_cards"
  ADD COLUMN "paused_by_school_id" TEXT,
  ADD COLUMN "state_before_pause" "srs_card_state";

CREATE INDEX "srs_review_cards_paused_by_school_id_idx"
  ON "srs_review_cards" ("paused_by_school_id")
  WHERE "paused_by_school_id" IS NOT NULL;
