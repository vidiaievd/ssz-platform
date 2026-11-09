-- Speech synthesizers (plan 88, step 6b): a third modality, a price per million characters,
-- the characters spoken on the ledger. Existing rows are untouched (price 0, characters null).

-- AlterEnum
ALTER TYPE "ai_model_modality" ADD VALUE 'tts';

-- AlterTable
ALTER TABLE "ai_model_prices" ADD COLUMN "chars_per_million" DECIMAL(12,6) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ai_calls" ADD COLUMN "characters" INTEGER;
