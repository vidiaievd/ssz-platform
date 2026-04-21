-- Block 5: raw SQL constraints that Prisma cannot express natively.
-- Applied after the block-5-cross-cutting migration which created the tables.

-- ─── Tags ──────────────────────────────────────────────────────────────────────

-- Partial unique: one active slug per (scope, owner_school_id) combination.
-- NULL owner_school_id counts as a single partition for global tags.
CREATE UNIQUE INDEX tags_slug_scope_owner_uniq
  ON tags(slug, scope, owner_school_id)
  WHERE deleted_at IS NULL;

-- Check: global tags have no school owner; school tags must have one.
ALTER TABLE tags
  ADD CONSTRAINT tags_scope_owner_consistent
  CHECK (
    (scope = 'global' AND owner_school_id IS NULL)
    OR
    (scope = 'school' AND owner_school_id IS NOT NULL)
  );

-- ─── Content Shares ────────────────────────────────────────────────────────────

-- Partial unique: a user can have at most one active (non-revoked) share per entity.
CREATE UNIQUE INDEX content_shares_active_uniq
  ON content_shares(entity_type, entity_id, shared_with_user_id)
  WHERE revoked_at IS NULL;

-- Check: if expires_at is set it must be in the future relative to created_at.
ALTER TABLE content_shares
  ADD CONSTRAINT content_shares_expires_after_created
  CHECK (expires_at IS NULL OR expires_at > created_at);

-- ─── Content Entitlements ──────────────────────────────────────────────────────

-- Partial unique: a user can have at most one active entitlement per container.
CREATE UNIQUE INDEX content_entitlements_active_uniq
  ON content_entitlements(user_id, container_id)
  WHERE revoked_at IS NULL;

-- Check: if expires_at is set it must be after granted_at.
ALTER TABLE content_entitlements
  ADD CONSTRAINT content_entitlements_expires_after_granted
  CHECK (expires_at IS NULL OR expires_at > granted_at);

-- Raw FK: container_id must reference an existing container.
-- ON DELETE RESTRICT prevents deleting a container that has active entitlements.
ALTER TABLE content_entitlements
  ADD CONSTRAINT content_entitlements_container_fk
  FOREIGN KEY (container_id)
  REFERENCES containers(id)
  ON DELETE RESTRICT;
