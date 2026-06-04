-- CreateEnum
CREATE TYPE "InvitationKind" AS ENUM ('register', 'onboard_existing');

-- AlterTable
ALTER TABLE "school_invitations"
  ADD COLUMN "kind"            "InvitationKind" NOT NULL DEFAULT 'register',
  ADD COLUMN "target_group_id" TEXT;
