-- CreateEnum
CREATE TYPE "SchoolType" AS ENUM ('ONLINE', 'HYBRID');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "type" "SchoolType" NOT NULL DEFAULT 'ONLINE';
