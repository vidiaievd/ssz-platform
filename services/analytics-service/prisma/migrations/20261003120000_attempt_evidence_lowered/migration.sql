-- ─── A delivery that gave part of the answer away (plan 66, decision Q2-B) ────────
-- `sort_into_buckets` with its «N igjen» counter on, or with most items in one bucket,
-- proves one step less on success. The rating reaching FSRS is already clamped for it
-- upstream; the group screens weigh rows read back from this table and need the same fact.
--
-- Nullable and not backfilled: every row here predates the flag, and none of them was
-- lowered — null reads as «not lowered».

ALTER TABLE "attempt_evidence" ADD COLUMN "evidence_lowered" BOOLEAN;
