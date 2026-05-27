-- Migration: add slug, website, contact_email, city to schools
--
-- Slug is a NOT NULL UNIQUE column. To handle existing rows we:
-- 1. Add slug as nullable
-- 2. Back-fill from existing name (slugified) or fall back to id
-- 3. Add the UNIQUE constraint
-- 4. Set NOT NULL

-- Step 1: add nullable columns
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "contact_email" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "city" TEXT;

-- Step 2: back-fill slug for existing rows
-- Slugify name: lowercase, replace non-alphanumeric sequences with hyphens, trim hyphens
UPDATE "schools"
SET "slug" = REGEXP_REPLACE(
               REGEXP_REPLACE(
                 LOWER("name"),
                 '[^a-z0-9]+', '-', 'g'
               ),
               '^-+|-+$', '', 'g'
             )
WHERE "slug" IS NULL;

-- Resolve any collisions by appending the first 8 chars of id
UPDATE "schools" s1
SET "slug" = s1."slug" || '-' || SUBSTRING(s1."id"::text, 1, 8)
WHERE EXISTS (
  SELECT 1 FROM "schools" s2
  WHERE s2."id" <> s1."id"
    AND s2."slug" = s1."slug"
);

-- Step 3: add UNIQUE constraint
CREATE UNIQUE INDEX IF NOT EXISTS "schools_slug_key" ON "schools"("slug");

-- Step 4: set NOT NULL
ALTER TABLE "schools" ALTER COLUMN "slug" SET NOT NULL;
