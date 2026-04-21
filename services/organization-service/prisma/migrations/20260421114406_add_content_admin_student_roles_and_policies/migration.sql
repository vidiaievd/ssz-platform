-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MemberRole" ADD VALUE 'CONTENT_ADMIN';
ALTER TYPE "MemberRole" ADD VALUE 'STUDENT';

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "defaultExplanationLanguage" TEXT,
ADD COLUMN     "requireTutorReviewForSelfPaced" BOOLEAN NOT NULL DEFAULT false;
