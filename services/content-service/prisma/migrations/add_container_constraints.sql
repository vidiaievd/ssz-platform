-- ─── Partial unique indexes ────────────────────────────────────────────────

-- Only one active slug per value (NULL slugs and soft-deleted containers are excluded).
CREATE UNIQUE INDEX idx_containers_unique_active_slug
  ON containers (slug)
  WHERE slug IS NOT NULL AND deleted_at IS NULL;

-- Only one draft version per container at a time.
CREATE UNIQUE INDEX idx_container_versions_unique_draft
  ON container_versions (container_id)
  WHERE status = 'draft';

-- Only one published version per container at a time.
CREATE UNIQUE INDEX idx_container_versions_unique_published
  ON container_versions (container_id)
  WHERE status = 'published';

-- ─── CHECK constraints: visibility vs ownership ─────────────────────────────

-- Personal content (no school): only public / shared / private are valid.
ALTER TABLE containers
  ADD CONSTRAINT chk_visibility_personal_owner
    CHECK (
      owner_school_id IS NOT NULL
      OR visibility::text IN ('public', 'shared', 'private')
    );

-- School content: all four visibility values are valid.
ALTER TABLE containers
  ADD CONSTRAINT chk_visibility_school_owner
    CHECK (
      owner_school_id IS NULL
      OR visibility::text IN ('public', 'school_private', 'shared', 'private')
    );

-- ─── Deferred self-referential FK ──────────────────────────────────────────

-- current_published_version_id → container_versions.id.
-- DEFERRABLE INITIALLY DEFERRED so that container + first version can be
-- inserted in the same transaction without ordering constraints.
ALTER TABLE containers
  ADD CONSTRAINT fk_containers_current_published_version
    FOREIGN KEY (current_published_version_id)
    REFERENCES container_versions (id)
    DEFERRABLE INITIALLY DEFERRED;
