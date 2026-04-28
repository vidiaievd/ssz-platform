-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('in_progress', 'submitted', 'scored', 'routed_for_review', 'abandoned');

-- CreateEnum
CREATE TYPE "content_type" AS ENUM ('container', 'lesson', 'vocabulary_list', 'grammar_rule', 'exercise');

-- CreateEnum
CREATE TYPE "difficulty_level" AS ENUM ('a1', 'a2', 'b1', 'b2', 'c1', 'c2');

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "enrollment_id" TEXT,
    "template_code" TEXT NOT NULL,
    "target_language" TEXT NOT NULL,
    "difficulty_level" "difficulty_level" NOT NULL,
    "status" "attempt_status" NOT NULL DEFAULT 'in_progress',
    "score" INTEGER,
    "passed" BOOLEAN,
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "submitted_answer" JSONB,
    "validation_details" JSONB,
    "feedback" JSONB,
    "answer_hash" TEXT,
    "revision_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "scored_at" TIMESTAMP(3),

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempts_user_id_status_idx" ON "attempts"("user_id", "status");

-- CreateIndex
CREATE INDEX "attempts_exercise_id_idx" ON "attempts"("exercise_id");

-- CreateIndex
CREATE INDEX "attempts_assignment_id_status_idx" ON "attempts"("assignment_id", "status");

-- CreateIndex
CREATE INDEX "attempts_user_id_exercise_id_started_at_idx" ON "attempts"("user_id", "exercise_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_event_id_key" ON "processed_events"("event_id");
