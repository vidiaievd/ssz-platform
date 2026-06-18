-- Add enrollment/onboarding fields to profiles:
-- guardianAccountId: seam for minors (always null for now)
-- dateOfBirth: collected now to avoid future backfill
-- languagesOfInterest: languages the user wants to learn (feeds recommendations)

ALTER TABLE "profiles"
  ADD COLUMN "guardian_account_id"    TEXT,
  ADD COLUMN "date_of_birth"          DATE,
  ADD COLUMN "languages_of_interest"  TEXT[] NOT NULL DEFAULT '{}';
