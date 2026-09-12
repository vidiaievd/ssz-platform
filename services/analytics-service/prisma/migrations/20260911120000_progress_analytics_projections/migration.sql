-- Plan 58, phase 1 — the two projections "absorbed" is counted from.
--
-- course_outline_item: item → unit of the published course, pulled from content-service.
-- item_progress:       whether one learner is done with one item, built from the same
--                      learning.progress.* stream progress_activity already consumes.

CREATE TABLE "course_outline_item" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "unit_order" INTEGER NOT NULL,
    "unit_title" TEXT,
    "item_id" TEXT NOT NULL,
    "item_type" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "refreshed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_outline_item_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_outline_item_container_id_item_id_key"
    ON "course_outline_item"("container_id", "item_id");
CREATE INDEX "course_outline_item_container_id_unit_order_idx"
    ON "course_outline_item"("container_id", "unit_order");
CREATE INDEX "course_outline_item_item_id_idx" ON "course_outline_item"("item_id");

CREATE TABLE "item_progress" (
    "user_id" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_progress_pkey" PRIMARY KEY ("user_id", "content_type", "content_id")
);

CREATE INDEX "item_progress_content_id_idx" ON "item_progress"("content_id");
CREATE INDEX "item_progress_user_id_status_idx" ON "item_progress"("user_id", "status");
