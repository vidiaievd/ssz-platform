-- Student Enrollment & Onboarding tables for organization-service.
-- E.2: school_onboarding_settings (per-school, upserted via PUT)
-- E.3: school_membership + state machine

-- ── E.2 ──────────────────────────────────────────────────────────────────────

CREATE TYPE "placement_mode" AS ENUM ('platform', 'school', 'none');
CREATE TYPE "approval_mode"  AS ENUM ('auto', 'manual');

CREATE TABLE "school_onboarding_settings" (
  "school_id"           UUID        NOT NULL PRIMARY KEY,
  "placement_mode"      "placement_mode" NOT NULL DEFAULT 'platform',
  "school_test_id"      UUID,
  "reuse_platform"      BOOLEAN     NOT NULL DEFAULT true,
  "max_result_age_days" INTEGER,
  "interview_required"  BOOLEAN     NOT NULL DEFAULT true,
  "auto_place_by_score" BOOLEAN     NOT NULL DEFAULT false,
  "collect_availability" BOOLEAN    NOT NULL DEFAULT true,
  "approval_mode"       "approval_mode" NOT NULL DEFAULT 'manual',
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "school_onboarding_settings_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE
);

-- ── E.3 ──────────────────────────────────────────────────────────────────────

CREATE TYPE "membership_status" AS ENUM (
  'pending', 'onboarding', 'placement-review', 'active', 'rejected', 'left'
);

CREATE TYPE "membership_source" AS ENUM (
  'public-apply', 'invite', 'direct'
);

CREATE TABLE "school_memberships" (
  "id"           UUID             NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_id"    UUID             NOT NULL,
  "student_id"   TEXT             NOT NULL,
  "status"       "membership_status" NOT NULL DEFAULT 'pending',
  "source"       "membership_source" NOT NULL,
  "language"     CHAR(2),
  "availability" JSONB,
  "created_at"   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ      NOT NULL DEFAULT now(),
  CONSTRAINT "school_memberships_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE
);

CREATE INDEX "school_memberships_school_id_status_idx" ON "school_memberships"("school_id", "status");
CREATE INDEX "school_memberships_school_id_student_id_idx" ON "school_memberships"("school_id", "student_id");
CREATE INDEX "school_memberships_student_id_idx" ON "school_memberships"("student_id");
