-- CreateEnum
CREATE TYPE "container_type" AS ENUM ('course', 'module', 'collection');

-- CreateEnum
CREATE TYPE "difficulty_level" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "visibility" AS ENUM ('public', 'school_private', 'shared', 'private');

-- CreateEnum
CREATE TYPE "access_tier" AS ENUM ('assigned_only', 'entitlement_required', 'free_within_school', 'public_free', 'public_paid');

-- CreateEnum
CREATE TYPE "version_status" AS ENUM ('draft', 'published', 'deprecated', 'archived');

-- CreateEnum
CREATE TYPE "container_item_type" AS ENUM ('container', 'lesson', 'vocabulary_list', 'grammar_rule', 'exercise');

-- CreateTable
CREATE TABLE "containers" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120),
    "container_type" "container_type" NOT NULL,
    "target_language" VARCHAR(10) NOT NULL,
    "difficulty_level" "difficulty_level" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "cover_image_media_id" UUID,
    "owner_user_id" UUID NOT NULL,
    "owner_school_id" UUID,
    "visibility" "visibility" NOT NULL,
    "access_tier" "access_tier" NOT NULL,
    "current_published_version_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_versions" (
    "id" UUID NOT NULL,
    "container_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "version_status" NOT NULL,
    "changelog" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ,
    "published_by_user_id" UUID,
    "deprecated_at" TIMESTAMPTZ,
    "sunset_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "revision_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "container_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_items" (
    "id" UUID NOT NULL,
    "container_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "item_type" "container_item_type" NOT NULL,
    "item_id" UUID NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "section_label" VARCHAR(100),
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "container_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_localizations" (
    "id" UUID NOT NULL,
    "container_id" UUID NOT NULL,
    "language_code" VARCHAR(10) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "container_localizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "containers_owner_user_id_idx" ON "containers"("owner_user_id");

-- CreateIndex
CREATE INDEX "containers_owner_school_id_idx" ON "containers"("owner_school_id");

-- CreateIndex
CREATE INDEX "containers_visibility_idx" ON "containers"("visibility");

-- CreateIndex
CREATE INDEX "containers_target_language_difficulty_level_idx" ON "containers"("target_language", "difficulty_level");

-- CreateIndex
CREATE INDEX "containers_deleted_at_visibility_target_language_idx" ON "containers"("deleted_at", "visibility", "target_language");

-- CreateIndex
CREATE INDEX "container_versions_container_id_idx" ON "container_versions"("container_id");

-- CreateIndex
CREATE INDEX "container_versions_status_sunset_at_idx" ON "container_versions"("status", "sunset_at");

-- CreateIndex
CREATE UNIQUE INDEX "container_versions_container_id_version_number_key" ON "container_versions"("container_id", "version_number");

-- CreateIndex
CREATE INDEX "container_items_container_version_id_idx" ON "container_items"("container_version_id");

-- CreateIndex
CREATE INDEX "container_items_item_type_item_id_idx" ON "container_items"("item_type", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "container_items_container_version_id_position_key" ON "container_items"("container_version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "container_localizations_container_id_language_code_key" ON "container_localizations"("container_id", "language_code");

-- AddForeignKey
ALTER TABLE "container_versions" ADD CONSTRAINT "container_versions_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_items" ADD CONSTRAINT "container_items_container_version_id_fkey" FOREIGN KEY ("container_version_id") REFERENCES "container_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_localizations" ADD CONSTRAINT "container_localizations_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
