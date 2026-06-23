-- AlterTable
ALTER TABLE "container_items" ADD COLUMN     "section_id" UUID;

-- CreateTable
CREATE TABLE "container_sections" (
    "id" UUID NOT NULL,
    "container_version_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "container_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "container_sections_container_version_id_idx" ON "container_sections"("container_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "container_sections_container_version_id_position_key" ON "container_sections"("container_version_id", "position");

-- CreateIndex
CREATE INDEX "container_items_section_id_idx" ON "container_items"("section_id");

-- AddForeignKey
ALTER TABLE "container_sections" ADD CONSTRAINT "container_sections_container_version_id_fkey" FOREIGN KEY ("container_version_id") REFERENCES "container_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_items" ADD CONSTRAINT "container_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "container_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
