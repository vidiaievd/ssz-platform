-- A shadow card per sound family (plan 86, step 8.3): content_id is the family's natural key
-- in content-service (`nb:kj`); content_id is already text.

ALTER TYPE "srs_content_type" ADD VALUE IF NOT EXISTS 'sound_atom';
