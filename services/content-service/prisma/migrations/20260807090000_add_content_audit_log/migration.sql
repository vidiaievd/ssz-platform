-- Who changed what, and when.
--
-- Not tied to a container: an exercise can be placed by several, and its edit
-- belongs in every feed that shows it. The read side resolves a container's
-- entities and filters by them, which also keeps a moved item's history intact.

-- CreateEnum
CREATE TYPE "audit_entity_type" AS ENUM ('container', 'lesson', 'exercise', 'vocabulary_list', 'grammar_rule');

-- CreateTable
CREATE TABLE "content_audit_log" (
    "id" UUID NOT NULL,
    "entity_type" "audit_entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "changed_fields" TEXT[],
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_audit_log_entity_type_entity_id_occurred_at_idx" ON "content_audit_log" ("entity_type", "entity_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "content_audit_log_occurred_at_idx" ON "content_audit_log" ("occurred_at" DESC);
