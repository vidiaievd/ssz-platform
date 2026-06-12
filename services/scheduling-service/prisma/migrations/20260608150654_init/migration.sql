-- CreateEnum
CREATE TYPE "week_day" AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');

-- CreateEnum
CREATE TYPE "lesson_status" AS ENUM ('scheduled', 'moved', 'cancelled');

-- CreateEnum
CREATE TYPE "absence_kind" AS ENUM ('sick', 'leave', 'vacancy');

-- CreateEnum
CREATE TYPE "absence_scope" AS ENUM ('today', 'window', 'permanent');

-- CreateEnum
CREATE TYPE "sub_urgency" AS ENUM ('today', 'upcoming', 'open');

-- CreateEnum
CREATE TYPE "sub_request_status" AS ENUM ('open', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "sub_assignment_status" AS ENUM ('proposed', 'confirmed', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "unit_status" AS ENUM ('planned', 'active', 'done', 'overridden');

-- CreateEnum
CREATE TYPE "alert_kind" AS ENUM ('overload', 'near_cap', 'daily_cap', 'consec', 'conflict', 'vacancy', 'uncovered', 'sub_overload', 'bottleneck');

-- CreateEnum
CREATE TYPE "alert_severity" AS ENUM ('warn', 'danger');

-- CreateEnum
CREATE TYPE "alert_status" AS ENUM ('raised', 'acknowledged', 'resolved');

-- CreateTable
CREATE TABLE "slots" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "weekday" "week_day" NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "room" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "slot_id" TEXT,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "room" TEXT,
    "status" "lesson_status" NOT NULL DEFAULT 'scheduled',
    "curriculum_unit_id" TEXT,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workload_policies" (
    "school_id" TEXT NOT NULL,
    "prep_factor" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "daily_contact_cap" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "max_consecutive" INTEGER NOT NULL DEFAULT 3,
    "near_cap_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workload_policies_pkey" PRIMARY KEY ("school_id")
);

-- CreateTable
CREATE TABLE "teacher_absences" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "kind" "absence_kind" NOT NULL,
    "scope" "absence_scope" NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitute_requests" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "absence_id" TEXT,
    "group_id" TEXT NOT NULL,
    "original_teacher_id" TEXT NOT NULL,
    "cover_from" DATE NOT NULL,
    "cover_to" DATE NOT NULL,
    "urgency" "sub_urgency" NOT NULL,
    "status" "sub_request_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "substitute_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "substitute_assignments" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "original_teacher_id" TEXT NOT NULL,
    "substitute_teacher_id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "cover_from" DATE NOT NULL,
    "cover_to" DATE NOT NULL,
    "fit_score" DOUBLE PRECISION NOT NULL,
    "status" "sub_assignment_status" NOT NULL DEFAULT 'proposed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "substitute_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_plans" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "target_weekly_hours" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_units" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "planned_sessions" INTEGER NOT NULL DEFAULT 1,
    "delivered_sessions" INTEGER NOT NULL DEFAULT 0,
    "required_level" TEXT,
    "status" "unit_status" NOT NULL DEFAULT 'planned',
    "override_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "kind" "alert_kind" NOT NULL,
    "severity" "alert_severity" NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "alert_status" NOT NULL DEFAULT 'raised',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_memberships" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "school_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "routing_key" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "correlation_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "slots_group_id_idx" ON "slots"("group_id");

-- CreateIndex
CREATE INDEX "slots_school_id_idx" ON "slots"("school_id");

-- CreateIndex
CREATE INDEX "lessons_group_id_date_idx" ON "lessons"("group_id", "date");

-- CreateIndex
CREATE INDEX "lessons_school_id_date_idx" ON "lessons"("school_id", "date");

-- CreateIndex
CREATE INDEX "lessons_teacher_id_date_idx" ON "lessons"("teacher_id", "date");

-- CreateIndex
CREATE INDEX "teacher_absences_school_id_teacher_id_idx" ON "teacher_absences"("school_id", "teacher_id");

-- CreateIndex
CREATE INDEX "teacher_absences_school_id_from_date_idx" ON "teacher_absences"("school_id", "from_date");

-- CreateIndex
CREATE INDEX "substitute_requests_school_id_status_idx" ON "substitute_requests"("school_id", "status");

-- CreateIndex
CREATE INDEX "substitute_requests_original_teacher_id_idx" ON "substitute_requests"("original_teacher_id");

-- CreateIndex
CREATE INDEX "substitute_assignments_request_id_idx" ON "substitute_assignments"("request_id");

-- CreateIndex
CREATE INDEX "substitute_assignments_substitute_teacher_id_idx" ON "substitute_assignments"("substitute_teacher_id");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_plans_group_id_key" ON "curriculum_plans"("group_id");

-- CreateIndex
CREATE INDEX "curriculum_plans_school_id_idx" ON "curriculum_plans"("school_id");

-- CreateIndex
CREATE INDEX "curriculum_units_plan_id_order_idx" ON "curriculum_units"("plan_id", "order");

-- CreateIndex
CREATE INDEX "alerts_school_id_status_idx" ON "alerts"("school_id", "status");

-- CreateIndex
CREATE INDEX "alerts_school_id_occurred_at_idx" ON "alerts"("school_id", "occurred_at");

-- CreateIndex
CREATE INDEX "school_memberships_user_id_idx" ON "school_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_memberships_school_id_user_id_key" ON "school_memberships"("school_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_event_id_key" ON "processed_events"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_event_id_key" ON "outbox"("event_id");

-- CreateIndex
CREATE INDEX "outbox_published_at_created_at_idx" ON "outbox"("published_at", "created_at");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_curriculum_unit_id_fkey" FOREIGN KEY ("curriculum_unit_id") REFERENCES "curriculum_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_requests" ADD CONSTRAINT "substitute_requests_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_requests" ADD CONSTRAINT "substitute_requests_absence_id_fkey" FOREIGN KEY ("absence_id") REFERENCES "teacher_absences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "substitute_assignments" ADD CONSTRAINT "substitute_assignments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "substitute_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_units" ADD CONSTRAINT "curriculum_units_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "curriculum_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
