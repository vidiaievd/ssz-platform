-- Plan 63 §2 D/E — what each piece of the exercise was about, and how it had to be known,
-- snapshotted at attempt start beside the atoms and the axes.
--
-- Defaults rather than NULL, as with the axes: an attempt started before the address
-- existed reports an empty list and 'unknown', which is a truthful statement about what
-- nobody said, and no backfill can improve on it.
ALTER TABLE "attempts" ADD COLUMN "item_targets" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "attempts" ADD COLUMN "modality" TEXT NOT NULL DEFAULT 'unknown';
