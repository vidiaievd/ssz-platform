-- AlterTable
ALTER TABLE "school_onboarding_settings" ADD COLUMN "age_bands" "AgeBand"[] NOT NULL DEFAULT ARRAY[]::"AgeBand"[];
ALTER TABLE "school_onboarding_settings" ADD COLUMN "collect_age_band" BOOLEAN NOT NULL DEFAULT false;
