-- OQ-106: the column was never filled in (always 0). Course completion is counted from
-- `course_outline_item` and `item_progress` instead.
ALTER TABLE "container_directory" DROP COLUMN "leaf_item_count";
