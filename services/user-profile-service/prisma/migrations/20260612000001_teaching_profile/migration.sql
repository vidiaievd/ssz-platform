-- Add TeachingProfile and TeachingLanguage tables.
-- TeachingProfile is the shared base for both school teachers (role=teacher)
-- and private tutors (role=tutor). TutorProfile extends it.

CREATE TABLE "teaching_profiles" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "profile_id" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "teaching_profiles_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "teaching_languages" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "teaching_profile_id" TEXT NOT NULL,
  "code"                CHAR(2) NOT NULL,
  "level"               TEXT,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "teaching_languages_teaching_profile_id_fkey"
    FOREIGN KEY ("teaching_profile_id") REFERENCES "teaching_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "teaching_languages_teaching_profile_id_code_key"
  ON "teaching_languages"("teaching_profile_id", "code");
