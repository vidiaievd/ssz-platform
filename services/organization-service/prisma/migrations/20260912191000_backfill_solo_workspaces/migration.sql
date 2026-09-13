-- Plan 59, phase 1: every tutoring group becomes a SOLO workspace.
--
-- A tutor's students stop being rows only organization-service understands and
-- become ordinary school_members of a workspace the tutor owns, so assignments,
-- review, scheduling and analytics — all of which ask which workspace a learner
-- belongs to — can answer for a private tutor.
--
-- The tutoring_* tables are left untouched and keep serving reads until the
-- tutoring module is removed (phase 3). Every statement guards with NOT EXISTS,
-- so re-running this migration on a half-migrated database is safe.

-- 1. One workspace per tutor who has a live tutoring group.
INSERT INTO schools (
  id, name, slug, description, "ownerId", "avatarUrl", type, kind,
  "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  COALESCE(NULLIF(btrim(tg.name), ''), 'My students'),
  'solo-' || tg."tutorId",
  tg.description,
  tg."tutorId",
  tg."avatarUrl",
  'ONLINE',
  'SOLO',
  TRUE,
  tg."createdAt",
  now()
FROM tutoring_groups tg
WHERE tg."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM schools s
    WHERE s."ownerId" = tg."tutorId" AND s.kind = 'SOLO' AND s."deletedAt" IS NULL
  );

-- 2. One group per workspace — where the tutor's learners actually sit. Open from
--    the start: there is no course to choose and no colleague to assign.
INSERT INTO school_groups (id, school_id, name, description, status, mode, created_at, updated_at)
SELECT gen_random_uuid(), s.id, s.name, s.description, 'active', 'online', s."createdAt", now()
FROM schools s
WHERE s.kind = 'SOLO'
  AND s."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM school_groups g WHERE g.school_id = s.id AND g.deleted_at IS NULL
  );

-- 3. The tutor teaches that group. Review authorisation reads the primary teacher
--    of the learner's group, so without this row a tutor cannot answer their own
--    students' work.
INSERT INTO group_teachers (id, group_id, user_id, role, created_at)
SELECT gen_random_uuid(), g.id, s."ownerId", 'primary', now()
FROM schools s
JOIN LATERAL (
  SELECT g.id FROM school_groups g
  WHERE g.school_id = s.id AND g.deleted_at IS NULL
  ORDER BY g.created_at, g.id
  LIMIT 1
) g ON TRUE
WHERE s.kind = 'SOLO'
  AND s."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM group_teachers t
    WHERE t.group_id = g.id AND t.user_id = s."ownerId" AND t.role = 'primary'
  );

-- 4. Students of the tutoring group become members of the workspace.
INSERT INTO school_members (id, "schoolId", "userId", role, status, "joinedAt")
SELECT gen_random_uuid(), s.id, ts."userId", 'STUDENT', 'active', ts."joinedAt"
FROM tutoring_students ts
JOIN tutoring_groups tg ON tg.id = ts."tutorGroupId" AND tg."deletedAt" IS NULL
JOIN schools s ON s."ownerId" = tg."tutorId" AND s.kind = 'SOLO' AND s."deletedAt" IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM school_members m WHERE m."schoolId" = s.id AND m."userId" = ts."userId"
);

-- 5. …and members of its group.
INSERT INTO school_group_members (id, group_id, user_id, role, status, added_at)
SELECT gen_random_uuid(), g.id, ts."userId", 'student', 'active', ts."joinedAt"
FROM tutoring_students ts
JOIN tutoring_groups tg ON tg.id = ts."tutorGroupId" AND tg."deletedAt" IS NULL
JOIN schools s ON s."ownerId" = tg."tutorId" AND s.kind = 'SOLO' AND s."deletedAt" IS NULL
JOIN LATERAL (
  SELECT g.id FROM school_groups g
  WHERE g.school_id = s.id AND g.deleted_at IS NULL
  ORDER BY g.created_at, g.id
  LIMIT 1
) g ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM school_group_members gm WHERE gm.group_id = g.id AND gm.user_id = ts."userId"
);

-- 6. A roster of bare ids is unreadable, and the denormalised name is what roster
--    reads use. Borrow it from any row the profile consumer has already filled;
--    the rest stay NULL until the next profile.updated event or the
--    backfill-member-profiles script.
UPDATE school_members m
SET name = src.name, "avatarUrl" = src."avatarUrl"
FROM (
  SELECT DISTINCT ON ("userId") "userId", name, "avatarUrl"
  FROM school_members
  WHERE name IS NOT NULL
  ORDER BY "userId", "joinedAt" DESC
) src
WHERE m.name IS NULL
  AND m."userId" = src."userId"
  AND m."schoolId" IN (SELECT id FROM schools WHERE kind = 'SOLO');
