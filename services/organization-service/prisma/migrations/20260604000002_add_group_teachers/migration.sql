-- CreateEnum
CREATE TYPE "GroupTeacherRole" AS ENUM ('primary', 'co_primary', 'substitute');

-- CreateTable
CREATE TABLE "group_teachers" (
    "id"         TEXT NOT NULL,
    "group_id"   TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "role"       "GroupTeacherRole" NOT NULL,
    "from_date"  DATE,
    "to_date"    DATE,
    "reason"     TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_teachers_group_id_user_id_role_key" ON "group_teachers"("group_id", "user_id", "role");

-- CreateIndex
CREATE INDEX "group_teachers_group_id_idx" ON "group_teachers"("group_id");

-- CreateIndex
CREATE INDEX "group_teachers_user_id_idx" ON "group_teachers"("user_id");

-- AddForeignKey
ALTER TABLE "group_teachers" ADD CONSTRAINT "group_teachers_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "school_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
