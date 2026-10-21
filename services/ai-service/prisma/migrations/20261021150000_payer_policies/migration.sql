-- CreateTable
CREATE TABLE "ai_payer_policies" (
    "payer_type" "ai_payer_type" NOT NULL,
    "payer_id" TEXT NOT NULL,
    "ai_enabled" BOOLEAN NOT NULL,
    "allowed_regions" "ai_region"[],
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_payer_policies_pkey" PRIMARY KEY ("payer_type","payer_id")
);
