-- CreateEnum
CREATE TYPE "ai_provider_kind" AS ENUM ('anthropic', 'openai', 'openai_compatible', 'azure_openai', 'google', 'fake');

-- CreateEnum
CREATE TYPE "ai_region" AS ENUM ('eu', 'us', 'global', 'local');

-- CreateEnum
CREATE TYPE "ai_model_status" AS ENUM ('active', 'deprecated', 'disabled');

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "ai_provider_kind" NOT NULL,
    "display_name" TEXT NOT NULL,
    "base_url" TEXT,
    "api_version" TEXT,
    "credential_ref" TEXT,
    "region" "ai_region" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "provider_model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "status" "ai_model_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_prices" (
    "id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "input_per_mtok" DECIMAL(12,6) NOT NULL,
    "output_per_mtok" DECIMAL(12,6) NOT NULL,
    "cache_read_per_mtok" DECIMAL(12,6) NOT NULL,
    "cache_write_per_mtok" DECIMAL(12,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_providers_code_key" ON "ai_providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_provider_id_provider_model_id_key" ON "ai_models"("provider_id", "provider_model_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_prices_model_id_effective_from_key" ON "ai_model_prices"("model_id", "effective_from");

-- AddForeignKey
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_prices" ADD CONSTRAINT "ai_model_prices_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
