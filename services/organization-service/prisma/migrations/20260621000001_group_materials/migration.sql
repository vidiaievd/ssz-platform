-- CreateTable
CREATE TABLE "group_materials" (
    "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id"  UUID NOT NULL,
    "course_id" TEXT NOT NULL,
    "added_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_materials_group_id_course_id_key" ON "group_materials"("group_id", "course_id");

-- CreateIndex
CREATE INDEX "group_materials_group_id_idx" ON "group_materials"("group_id");

-- AddForeignKey
ALTER TABLE "group_materials" ADD CONSTRAINT "group_materials_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "school_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
