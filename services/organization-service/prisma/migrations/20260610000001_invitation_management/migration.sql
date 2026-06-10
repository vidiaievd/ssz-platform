-- Rename CANCELLED → REVOKED in the shared InvitationStatus enum
ALTER TYPE "InvitationStatus" RENAME VALUE 'CANCELLED' TO 'REVOKED';

-- SchoolInvitation: add lifecycle-tracking columns
ALTER TABLE "school_invitations"
  ADD COLUMN IF NOT EXISTS "invited_by"    TEXT,
  ADD COLUMN IF NOT EXISTS "accepted_at"   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "last_sent_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "resend_count"  INTEGER     NOT NULL DEFAULT 0;

-- Rename unquoted column names to snake_case (existing columns were created without @map)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='school_invitations' AND column_name='expiresat') THEN
    ALTER TABLE "school_invitations" RENAME COLUMN "expiresat" TO "expires_at";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='school_invitations' AND column_name='createdat') THEN
    ALTER TABLE "school_invitations" RENAME COLUMN "createdat" TO "created_at";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='school_invitations' AND column_name='updatedat') THEN
    ALTER TABLE "school_invitations" RENAME COLUMN "updatedat" TO "updated_at";
  END IF;
END $$;

-- Indexes for listing/filtering
CREATE INDEX IF NOT EXISTS "school_invitations_schoolId_status_idx"
  ON "school_invitations"("schoolId", "status");
CREATE INDEX IF NOT EXISTS "school_invitations_schoolId_email_role_idx"
  ON "school_invitations"("schoolId", "email", "role");

-- TutoringInvitation: rename tutorGroupId column to snake_case and add lifecycle columns
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='tutoring_invitations' AND column_name='tutorgroupid') THEN
    ALTER TABLE "tutoring_invitations" RENAME COLUMN "tutorgroupid" TO "tutor_group_id";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='tutoring_invitations' AND column_name='expiresat') THEN
    ALTER TABLE "tutoring_invitations" RENAME COLUMN "expiresat" TO "expires_at";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='tutoring_invitations' AND column_name='createdat') THEN
    ALTER TABLE "tutoring_invitations" RENAME COLUMN "createdat" TO "created_at";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='tutoring_invitations' AND column_name='updatedat') THEN
    ALTER TABLE "tutoring_invitations" RENAME COLUMN "updatedat" TO "updated_at";
  END IF;
END $$;

ALTER TABLE "tutoring_invitations"
  ADD COLUMN IF NOT EXISTS "accepted_at"  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "last_sent_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "resend_count" INTEGER     NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "tutoring_invitations_tutorGroupId_status_idx"
  ON "tutoring_invitations"("tutor_group_id", "status");
