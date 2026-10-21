-- Plan 76, 5.3: which media assets an exercise names, so media-service can ask before it
-- removes an exercise clip. An exercise keeps its asset ids inside the document under names
-- that differ by template (assetId, mediaId, image.assetId, ...), so the index takes every
-- UUID in `content` and `draft_content`: an id that is not an asset only keeps an orphan
-- check from deleting something, never makes it delete anything.
CREATE TABLE "exercise_media_refs" (
    "exercise_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,

    CONSTRAINT "exercise_media_refs_pkey" PRIMARY KEY ("exercise_id", "media_id")
);

CREATE INDEX "exercise_media_refs_media_id_idx" ON "exercise_media_refs"("media_id");

ALTER TABLE "exercise_media_refs" ADD CONSTRAINT "exercise_media_refs_exercise_id_fkey"
    FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rebuilt by the database on every write of either document, so no writer can forget it:
-- the repository, the duplicate of B1.3, the seeds and raw SQL all go through here.
CREATE OR REPLACE FUNCTION rebuild_exercise_media_refs() RETURNS trigger AS $$
BEGIN
    DELETE FROM "exercise_media_refs" WHERE "exercise_id" = NEW."id";
    INSERT INTO "exercise_media_refs" ("exercise_id", "media_id")
    SELECT DISTINCT NEW."id", lower(m[1])::uuid
    FROM regexp_matches(
        NEW."content"::text || ' ' || COALESCE(NEW."draft_content"::text, ''),
        '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})',
        'g'
    ) AS m;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "exercises_rebuild_media_refs"
    AFTER INSERT OR UPDATE OF "content", "draft_content" ON "exercises"
    FOR EACH ROW EXECUTE FUNCTION rebuild_exercise_media_refs();

-- Backfill: every exercise that exists now, soft-deleted ones included (they can be restored).
INSERT INTO "exercise_media_refs" ("exercise_id", "media_id")
SELECT DISTINCT e."id", lower(m[1])::uuid
FROM "exercises" e,
     regexp_matches(
         e."content"::text || ' ' || COALESCE(e."draft_content"::text, ''),
         '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})',
         'g'
     ) AS m;
