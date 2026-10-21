-- Plan 39, B8: an exercise gets a title of its own. Nullable, no backfill: a row
-- without one is labelled by content.title, then by its template name, exactly as
-- before this column existed.
ALTER TABLE "exercises" ADD COLUMN "title" VARCHAR(200);
