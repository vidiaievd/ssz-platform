-- Manager RBAC (§R.1–R.4): MANAGER role, per-member capability grants,
-- capabilities stored on invitation for materialization at accept.

-- 1. New MANAGER value in MemberRole enum
ALTER TYPE "MemberRole" ADD VALUE IF NOT EXISTS 'MANAGER';

-- 2. Capability grants table (MANAGER members only;
--    OWNER/ADMIN inherit all capabilities implicitly)
CREATE TABLE IF NOT EXISTS "school_member_permissions" (
  "school_id"    UUID        NOT NULL,
  "user_id"      UUID        NOT NULL,
  "member_id"    UUID        NOT NULL UNIQUE,
  "capabilities" TEXT[]      NOT NULL DEFAULT '{}',
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("school_id", "user_id"),
  FOREIGN KEY ("member_id") REFERENCES "school_members"("id") ON DELETE CASCADE
);

-- 3. capabilities column on school_invitations (stores MANAGER capability set
--    at invite-time; materialized into school_member_permissions on accept)
ALTER TABLE "school_invitations"
  ADD COLUMN IF NOT EXISTS "capabilities" TEXT[] NOT NULL DEFAULT '{}';
