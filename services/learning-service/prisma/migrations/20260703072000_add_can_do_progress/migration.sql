-- CreateEnum
CREATE TYPE "can_do_status" AS ENUM ('not_started', 'in_progress', 'achieved');

-- CreateTable
CREATE TABLE "can_do_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "descriptor_id" TEXT NOT NULL,
    "status" "can_do_status" NOT NULL DEFAULT 'not_started',
    "achieved_at" TIMESTAMP(3),
    "self_assessed" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "can_do_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "can_do_progress_user_id_descriptor_id_key" ON "can_do_progress"("user_id", "descriptor_id");

-- CreateIndex
CREATE INDEX "can_do_progress_user_id_status_idx" ON "can_do_progress"("user_id", "status");
