-- CreateTable
CREATE TABLE "ai_bindings" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "primary_model_id" TEXT NOT NULL,
    "fallback_model_id" TEXT,
    "max_output_tokens" INTEGER NOT NULL,
    "temperature" DOUBLE PRECISION,
    "timeout_ms" INTEGER NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_binding_changes" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "before" JSONB,
    "after" JSONB NOT NULL,

    CONSTRAINT "ai_binding_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_bindings_capability_key" ON "ai_bindings"("capability");

-- CreateIndex
CREATE UNIQUE INDEX "ai_binding_changes_capability_version_key" ON "ai_binding_changes"("capability", "version");

-- AddForeignKey
ALTER TABLE "ai_bindings" ADD CONSTRAINT "ai_bindings_primary_model_id_fkey" FOREIGN KEY ("primary_model_id") REFERENCES "ai_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_bindings" ADD CONSTRAINT "ai_bindings_fallback_model_id_fkey" FOREIGN KEY ("fallback_model_id") REFERENCES "ai_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

