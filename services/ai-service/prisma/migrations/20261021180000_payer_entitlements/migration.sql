-- CreateTable
CREATE TABLE "ai_payer_entitlements" (
    "payer_type" "ai_payer_type" NOT NULL,
    "payer_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_payer_entitlements_pkey" PRIMARY KEY ("payer_type","payer_id")
);
