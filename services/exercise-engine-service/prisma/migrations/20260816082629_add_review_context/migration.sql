-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "auto_passed_items" INTEGER,
ADD COLUMN     "container_id" TEXT,
ADD COLUMN     "exercise_path" JSONB,
ADD COLUMN     "group_id" TEXT,
ADD COLUMN     "previous_attempt_id" TEXT,
ADD COLUMN     "review_claimed_at" TIMESTAMP(3),
ADD COLUMN     "review_claimed_by" TEXT,
ADD COLUMN     "school_id" TEXT,
ADD COLUMN     "total_items" INTEGER;

-- CreateIndex
CREATE INDEX "attempts_school_id_status_submitted_at_idx" ON "attempts"("school_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "attempts_group_id_status_submitted_at_idx" ON "attempts"("group_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "attempts_container_id_status_idx" ON "attempts"("container_id", "status");

-- CreateIndex
CREATE INDEX "attempts_school_id_reviewed_at_idx" ON "attempts"("school_id", "reviewed_at");
