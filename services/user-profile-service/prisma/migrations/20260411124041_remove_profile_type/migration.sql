/*
  Warnings:

  - You are about to drop the column `profileType` on the `profiles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "profileType";

-- DropEnum
DROP TYPE "ProfileType";
