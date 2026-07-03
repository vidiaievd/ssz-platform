-- AlterEnum: add TARGETS to relation_kind
ALTER TYPE "relation_kind" ADD VALUE IF NOT EXISTS 'targets';

-- CreateEnum
CREATE TYPE "can_do_skill" AS ENUM ('listening', 'reading', 'spoken', 'written');

-- CreateEnum
CREATE TYPE "can_do_scope" AS ENUM ('global', 'school');

-- CreateTable
CREATE TABLE "can_do_descriptors" (
    "id" UUID NOT NULL,
    "cefr_level" "difficulty_level" NOT NULL,
    "skill" "can_do_skill" NOT NULL,
    "scope" "can_do_scope" NOT NULL,
    "owner_school_id" UUID,
    "source" VARCHAR(80),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "can_do_descriptors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "can_do_descriptors_scope_check"
        CHECK (
            (scope = 'global' AND owner_school_id IS NULL) OR
            (scope = 'school' AND owner_school_id IS NOT NULL)
        )
);

-- CreateTable
CREATE TABLE "can_do_descriptor_localizations" (
    "id" UUID NOT NULL,
    "descriptor_id" UUID NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "can_do_descriptor_localizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "can_do_descriptors_cefr_level_skill_scope_idx" ON "can_do_descriptors"("cefr_level", "skill", "scope");

-- CreateIndex
CREATE INDEX "can_do_descriptors_owner_school_id_idx" ON "can_do_descriptors"("owner_school_id");

-- CreateIndex
CREATE UNIQUE INDEX "can_do_descriptor_localizations_descriptor_id_language_key" ON "can_do_descriptor_localizations"("descriptor_id", "language");

-- AddForeignKey
ALTER TABLE "can_do_descriptor_localizations"
    ADD CONSTRAINT "can_do_descriptor_localizations_descriptor_id_fkey"
    FOREIGN KEY ("descriptor_id") REFERENCES "can_do_descriptors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
