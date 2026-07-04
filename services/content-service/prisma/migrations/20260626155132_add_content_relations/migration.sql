-- CreateEnum
CREATE TYPE "relatable_entity_type" AS ENUM ('container', 'lesson', 'vocabulary_list', 'vocabulary_item', 'grammar_rule', 'exercise', 'can_do_descriptor');

-- CreateEnum
CREATE TYPE "relation_kind" AS ENUM ('introduces', 'features', 'practiced_by', 'prerequisite', 'related');

-- CreateTable
CREATE TABLE "content_relations" (
    "id" UUID NOT NULL,
    "source_type" "relatable_entity_type" NOT NULL,
    "source_id" UUID NOT NULL,
    "target_type" "relatable_entity_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "relation_kind" "relation_kind" NOT NULL,
    "owner_school_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "content_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_relations_source_type_source_id_relation_kind_idx" ON "content_relations"("source_type", "source_id", "relation_kind");

-- CreateIndex
CREATE INDEX "content_relations_target_type_target_id_relation_kind_idx" ON "content_relations"("target_type", "target_id", "relation_kind");

-- CreateIndex
CREATE UNIQUE INDEX "content_relations_source_type_source_id_relation_kind_targe_key" ON "content_relations"("source_type", "source_id", "relation_kind", "target_type", "target_id");
