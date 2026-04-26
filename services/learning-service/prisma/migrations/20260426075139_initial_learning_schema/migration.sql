-- CreateEnum
CREATE TYPE "content_type" AS ENUM ('container', 'lesson', 'vocabulary_list', 'grammar_rule', 'exercise');

-- CreateEnum
CREATE TYPE "assignment_status" AS ENUM ('active', 'completed', 'cancelled', 'overdue');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('active', 'completed', 'unenrolled');

-- CreateEnum
CREATE TYPE "progress_status" AS ENUM ('not_started', 'in_progress', 'completed', 'needs_review');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('pending_review', 'approved', 'rejected', 'revision_requested', 'resubmitted');

-- CreateEnum
CREATE TYPE "revision_decision" AS ENUM ('approved', 'rejected', 'revision_requested');

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "assigner_id" TEXT NOT NULL,
    "assignee_id" TEXT NOT NULL,
    "school_id" TEXT,
    "content_type" "content_type" NOT NULL,
    "content_id" TEXT NOT NULL,
    "status" "assignment_status" NOT NULL DEFAULT 'active',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_reason" TEXT,
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "school_id" TEXT,
    "status" "enrollment_status" NOT NULL DEFAULT 'active',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "unenrolled_at" TIMESTAMP(3),
    "unenroll_reason" TEXT,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "content_type" "content_type" NOT NULL,
    "content_id" TEXT NOT NULL,
    "status" "progress_status" NOT NULL DEFAULT 'not_started',
    "attempts_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "time_spent_seconds" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER,
    "completed_at" TIMESTAMP(3),
    "needs_review_since" TIMESTAMP(3),
    "review_resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "school_id" TEXT,
    "status" "submission_status" NOT NULL DEFAULT 'pending_review',
    "current_revision_number" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_revisions" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "feedback" TEXT,
    "score" INTEGER,
    "decision" "revision_decision",

    CONSTRAINT "submission_revisions_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "assignments_assignee_id_status_idx" ON "assignments"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "assignments_assigner_id_status_idx" ON "assignments"("assigner_id", "status");

-- CreateIndex
CREATE INDEX "assignments_due_at_status_idx" ON "assignments"("due_at", "status");

-- CreateIndex
CREATE INDEX "assignments_content_type_content_id_idx" ON "assignments"("content_type", "content_id");

-- CreateIndex
CREATE INDEX "enrollments_user_id_status_idx" ON "enrollments"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_user_id_container_id_key" ON "enrollments"("user_id", "container_id");

-- CreateIndex
CREATE INDEX "user_progress_user_id_idx" ON "user_progress"("user_id");

-- CreateIndex
CREATE INDEX "user_progress_content_type_content_id_idx" ON "user_progress"("content_type", "content_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_progress_user_id_content_type_content_id_key" ON "user_progress"("user_id", "content_type", "content_id");

-- CreateIndex
CREATE INDEX "submissions_user_id_status_idx" ON "submissions"("user_id", "status");

-- CreateIndex
CREATE INDEX "submissions_assignment_id_idx" ON "submissions"("assignment_id");

-- CreateIndex
CREATE INDEX "submissions_school_id_status_idx" ON "submissions"("school_id", "status");

-- CreateIndex
CREATE INDEX "submission_revisions_submission_id_idx" ON "submission_revisions"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_revisions_submission_id_revision_number_key" ON "submission_revisions"("submission_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_event_id_key" ON "processed_events"("event_id");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
