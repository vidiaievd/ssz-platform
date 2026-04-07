-- CreateEnum
CREATE TYPE "ProfileType" AS ENUM ('STUDENT', 'TUTOR');

-- CreateEnum
CREATE TYPE "LanguageLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "TutorProficiency" AS ENUM ('NATIVE', 'C2', 'C1', 'B2');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateTable: profiles (base profile for all users)
CREATE TABLE "profiles" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"      UUID         NOT NULL,
    "display_name" TEXT         NOT NULL,
    "first_name"   TEXT,
    "last_name"    TEXT,
    "avatar_url"   TEXT,
    "bio"          TEXT,
    "timezone"     TEXT         NOT NULL DEFAULT 'UTC',
    "locale"       TEXT         NOT NULL DEFAULT 'en',
    "profile_type" "ProfileType" NOT NULL,
    "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ  NOT NULL,
    "deleted_at"   TIMESTAMPTZ,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");
CREATE INDEX "profiles_user_id_idx" ON "profiles"("user_id");
CREATE INDEX "profiles_profile_type_idx" ON "profiles"("profile_type");
CREATE INDEX "profiles_deleted_at_idx" ON "profiles"("deleted_at");

-- CreateTable: student_profiles
CREATE TABLE "student_profiles" (
    "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_id"          UUID NOT NULL,
    "native_language"     TEXT NOT NULL,
    "current_streak_days" INTEGER NOT NULL DEFAULT 0,
    "total_study_minutes" INTEGER NOT NULL DEFAULT 0,
    "xp_points"           INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_profiles_profile_id_key" ON "student_profiles"("profile_id");

-- CreateTable: student_target_languages
CREATE TABLE "student_target_languages" (
    "id"                 UUID           NOT NULL DEFAULT gen_random_uuid(),
    "student_profile_id" UUID           NOT NULL,
    "language_code"      TEXT           NOT NULL,
    "current_level"      "LanguageLevel" NOT NULL,
    "target_level"       "LanguageLevel",
    "started_at"         TIMESTAMPTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_target_languages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_target_languages_student_profile_id_language_code_key"
    ON "student_target_languages"("student_profile_id", "language_code");

-- CreateTable: tutor_profiles
CREATE TABLE "tutor_profiles" (
    "id"                   UUID        NOT NULL DEFAULT gen_random_uuid(),
    "profile_id"           UUID        NOT NULL,
    "headline"             TEXT        NOT NULL,
    "years_of_experience"  INTEGER     NOT NULL,
    "hourly_rate"          DECIMAL(10,2),
    "currency"             CHAR(3),
    "is_available_for_hire" BOOLEAN    NOT NULL DEFAULT true,

    CONSTRAINT "tutor_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tutor_profiles_profile_id_key" ON "tutor_profiles"("profile_id");

-- CreateTable: tutor_languages
CREATE TABLE "tutor_languages" (
    "id"               UUID              NOT NULL DEFAULT gen_random_uuid(),
    "tutor_profile_id" UUID              NOT NULL,
    "language_code"    TEXT              NOT NULL,
    "proficiency"      "TutorProficiency" NOT NULL,
    "teaches_levels"   TEXT[]            NOT NULL,

    CONSTRAINT "tutor_languages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tutor_languages_tutor_profile_id_language_code_key"
    ON "tutor_languages"("tutor_profile_id", "language_code");

-- CreateTable: tutor_qualifications
CREATE TABLE "tutor_qualifications" (
    "id"                  UUID                NOT NULL DEFAULT gen_random_uuid(),
    "tutor_profile_id"    UUID                NOT NULL,
    "title"               TEXT                NOT NULL,
    "institution"         TEXT                NOT NULL,
    "year"                INTEGER             NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "document_url"        TEXT,
    "created_at"          TIMESTAMPTZ         NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutor_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: notification_preferences
CREATE TABLE "notification_preferences" (
    "id"                     UUID    NOT NULL DEFAULT gen_random_uuid(),
    "profile_id"             UUID    NOT NULL,
    "email_enabled"          BOOLEAN NOT NULL DEFAULT true,
    "push_enabled"           BOOLEAN NOT NULL DEFAULT true,
    "study_reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder_time"          TEXT,
    "quiet_hours_start"      TEXT,
    "quiet_hours_end"        TEXT,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_preferences_profile_id_key"
    ON "notification_preferences"("profile_id");

-- CreateTable: processed_events (idempotency table)
CREATE TABLE "processed_events" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "event_id"     TEXT        NOT NULL,
    "event_type"   TEXT        NOT NULL,
    "processed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "processed_events_event_id_key" ON "processed_events"("event_id");
CREATE INDEX "processed_events_event_id_idx" ON "processed_events"("event_id");

-- AddForeignKey
ALTER TABLE "student_profiles"
    ADD CONSTRAINT "student_profiles_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_target_languages"
    ADD CONSTRAINT "student_target_languages_student_profile_id_fkey"
    FOREIGN KEY ("student_profile_id") REFERENCES "student_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tutor_profiles"
    ADD CONSTRAINT "tutor_profiles_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tutor_languages"
    ADD CONSTRAINT "tutor_languages_tutor_profile_id_fkey"
    FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tutor_qualifications"
    ADD CONSTRAINT "tutor_qualifications_tutor_profile_id_fkey"
    FOREIGN KEY ("tutor_profile_id") REFERENCES "tutor_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_preferences"
    ADD CONSTRAINT "notification_preferences_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
