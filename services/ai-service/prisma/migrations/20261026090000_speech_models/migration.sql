-- Speech models (plan 82, step 3): the model's modality, a price per audio hour, audio
-- length on the ledger. Existing rows are language models priced per token.

-- CreateEnum
CREATE TYPE "ai_model_modality" AS ENUM ('llm', 'speech');

-- AlterTable
ALTER TABLE "ai_models" ADD COLUMN "modality" "ai_model_modality" NOT NULL DEFAULT 'llm';

-- AlterTable
ALTER TABLE "ai_model_prices" ADD COLUMN "audio_per_hour" DECIMAL(12,6) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ai_calls" ADD COLUMN "audio_ms" INTEGER;
