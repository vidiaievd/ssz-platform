-- CreateEnum
CREATE TYPE "srs_content_type" AS ENUM ('exercise', 'vocabulary_word');

-- CreateEnum
CREATE TYPE "srs_card_state" AS ENUM ('new', 'learning', 'review', 'relearning', 'suspended');

-- CreateTable
CREATE TABLE "srs_review_cards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content_type" "srs_content_type" NOT NULL,
    "content_id" TEXT NOT NULL,
    "state" "srs_card_state" NOT NULL DEFAULT 'new',
    "due_at" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsed_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scheduled_days" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "learning_steps" INTEGER NOT NULL DEFAULT 0,
    "last_reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "srs_review_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "srs_review_cards_user_id_due_at_state_idx" ON "srs_review_cards"("user_id", "due_at", "state");

-- CreateIndex
CREATE UNIQUE INDEX "srs_review_cards_user_id_content_type_content_id_key" ON "srs_review_cards"("user_id", "content_type", "content_id");
