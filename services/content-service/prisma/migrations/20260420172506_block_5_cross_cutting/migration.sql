-- CreateEnum
CREATE TYPE "tag_category" AS ENUM ('topic', 'situation', 'skill', 'level', 'other');

-- CreateEnum
CREATE TYPE "tag_scope" AS ENUM ('global', 'school');

-- CreateEnum
CREATE TYPE "taggable_entity_type" AS ENUM ('container', 'lesson', 'vocabulary_list', 'grammar_rule', 'exercise');

-- CreateEnum
CREATE TYPE "share_permission" AS ENUM ('read', 'read_and_review');

-- CreateEnum
CREATE TYPE "entitlement_type" AS ENUM ('manual', 'subscription', 'one_time_purchase', 'promotional', 'free_granted');

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "category" "tag_category" NOT NULL,
    "scope" "tag_scope" NOT NULL,
    "owner_school_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_assignments" (
    "id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "entity_type" "taggable_entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_user_id" UUID NOT NULL,

    CONSTRAINT "tag_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_shares" (
    "id" UUID NOT NULL,
    "entity_type" "taggable_entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "shared_with_user_id" UUID NOT NULL,
    "shared_by_user_id" UUID NOT NULL,
    "permission" "share_permission" NOT NULL DEFAULT 'read',
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "container_id" UUID NOT NULL,
    "entitlement_type" "entitlement_type" NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "granted_by_user_id" UUID,
    "source_reference" VARCHAR(200),
    "metadata" JSONB,

    CONSTRAINT "content_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tags_scope_deleted_at_idx" ON "tags"("scope", "deleted_at");

-- CreateIndex
CREATE INDEX "tags_owner_school_id_idx" ON "tags"("owner_school_id");

-- CreateIndex
CREATE INDEX "tag_assignments_entity_type_entity_id_idx" ON "tag_assignments"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "tag_assignments_tag_id_idx" ON "tag_assignments"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_assignments_tag_id_entity_type_entity_id_key" ON "tag_assignments"("tag_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "content_shares_shared_with_user_id_revoked_at_idx" ON "content_shares"("shared_with_user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "content_shares_entity_type_entity_id_idx" ON "content_shares"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "content_shares_expires_at_idx" ON "content_shares"("expires_at");

-- CreateIndex
CREATE INDEX "content_entitlements_user_id_container_id_idx" ON "content_entitlements"("user_id", "container_id");

-- CreateIndex
CREATE INDEX "content_entitlements_user_id_expires_at_idx" ON "content_entitlements"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "content_entitlements_container_id_idx" ON "content_entitlements"("container_id");

-- AddForeignKey
ALTER TABLE "tag_assignments" ADD CONSTRAINT "tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
