-- Rename CANCELLED → REVOKED in the shared InvitationStatus enum
ALTER TYPE "InvitationStatus" RENAME VALUE 'CANCELLED' TO 'REVOKED';

-- ─── school_invitations ───────────────────────────────────────────────────────

-- Rename existing camelCase columns to snake_case (Prisma now uses @map for these)
ALTER TABLE "school_invitations" RENAME COLUMN "expiresAt" TO "expires_at";
ALTER TABLE "school_invitations" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "school_invitations" RENAME COLUMN "updatedAt" TO "updated_at";

-- Add new lifecycle-tracking columns
ALTER TABLE "school_invitations"
  ADD COLUMN IF NOT EXISTS "invited_by"   TEXT,
  ADD COLUMN IF NOT EXISTS "accepted_at"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "last_sent_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "resend_count" INTEGER      NOT NULL DEFAULT 0;

-- Indexes for listing/filtering
CREATE INDEX IF NOT EXISTS "school_invitations_schoolId_status_idx"
  ON "school_invitations"("schoolId", "status");
CREATE INDEX IF NOT EXISTS "school_invitations_schoolId_email_role_idx"
  ON "school_invitations"("schoolId", "email", "role");

-- ─── tutoring_invitations ─────────────────────────────────────────────────────

-- Rename existing camelCase columns to snake_case
ALTER TABLE "tutoring_invitations" RENAME COLUMN "tutorGroupId" TO "tutor_group_id";
ALTER TABLE "tutoring_invitations" RENAME COLUMN "expiresAt"    TO "expires_at";
ALTER TABLE "tutoring_invitations" RENAME COLUMN "createdAt"    TO "created_at";
ALTER TABLE "tutoring_invitations" RENAME COLUMN "updatedAt"    TO "updated_at";

-- Add new lifecycle-tracking columns
ALTER TABLE "tutoring_invitations"
  ADD COLUMN IF NOT EXISTS "accepted_at"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "last_sent_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "resend_count" INTEGER      NOT NULL DEFAULT 0;

-- Update FK constraint to reference renamed column
ALTER TABLE "tutoring_invitations"
  DROP CONSTRAINT IF EXISTS "tutoring_invitations_tutorGroupId_fkey";
ALTER TABLE "tutoring_invitations"
  ADD CONSTRAINT "tutoring_invitations_tutor_group_id_fkey"
  FOREIGN KEY ("tutor_group_id") REFERENCES "tutoring_groups"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "tutoring_invitations_tutor_group_id_status_idx"
  ON "tutoring_invitations"("tutor_group_id", "status");
