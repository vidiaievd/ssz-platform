-- Convert all internal entity ID columns from TEXT to native PostgreSQL UUID type.
-- External IDs (userId, ownerId, tutorId, invitedBy, courseId, etc.) remain TEXT
-- because they reference other services whose PKs are also TEXT.

-- ─── Step 1: Drop all FK constraints ────────────────────────────────────────

ALTER TABLE school_members            DROP CONSTRAINT "school_members_schoolId_fkey";
ALTER TABLE school_invitations        DROP CONSTRAINT "school_invitations_schoolId_fkey";
ALTER TABLE school_groups             DROP CONSTRAINT "school_groups_school_id_fkey";
ALTER TABLE school_group_members      DROP CONSTRAINT "school_group_members_group_id_fkey";
ALTER TABLE group_teachers            DROP CONSTRAINT "group_teachers_group_id_fkey";
ALTER TABLE school_teachers           DROP CONSTRAINT "school_teachers_member_id_fkey";
ALTER TABLE school_member_permissions DROP CONSTRAINT "school_member_permissions_member_id_fkey";
ALTER TABLE tutoring_students         DROP CONSTRAINT "tutoring_students_tutorGroupId_fkey";
ALTER TABLE tutoring_invitations      DROP CONSTRAINT "tutoring_invitations_tutor_group_id_fkey";

-- ─── Step 2: Convert columns ─────────────────────────────────────────────────

-- schools
ALTER TABLE schools ALTER COLUMN id TYPE UUID USING id::uuid;

-- school_members
ALTER TABLE school_members ALTER COLUMN id       TYPE UUID USING id::uuid;
ALTER TABLE school_members ALTER COLUMN "schoolId" TYPE UUID USING "schoolId"::uuid;

-- school_invitations
ALTER TABLE school_invitations ALTER COLUMN id               TYPE UUID USING id::uuid;
ALTER TABLE school_invitations ALTER COLUMN "schoolId"       TYPE UUID USING "schoolId"::uuid;
ALTER TABLE school_invitations ALTER COLUMN target_group_id  TYPE UUID USING target_group_id::uuid;

-- school_groups
ALTER TABLE school_groups ALTER COLUMN id        TYPE UUID USING id::uuid;
ALTER TABLE school_groups ALTER COLUMN school_id TYPE UUID USING school_id::uuid;

-- school_group_members
ALTER TABLE school_group_members ALTER COLUMN id       TYPE UUID USING id::uuid;
ALTER TABLE school_group_members ALTER COLUMN group_id TYPE UUID USING group_id::uuid;

-- group_teachers
ALTER TABLE group_teachers ALTER COLUMN id       TYPE UUID USING id::uuid;
ALTER TABLE group_teachers ALTER COLUMN group_id TYPE UUID USING group_id::uuid;

-- school_teachers (denormalised school_id has no FK, but should match type)
ALTER TABLE school_teachers ALTER COLUMN member_id  TYPE UUID USING member_id::uuid;
ALTER TABLE school_teachers ALTER COLUMN school_id  TYPE UUID USING school_id::uuid;

-- school_member_permissions (school_id is denormalised; user_id stays TEXT)
ALTER TABLE school_member_permissions ALTER COLUMN member_id  TYPE UUID USING member_id::uuid;
ALTER TABLE school_member_permissions ALTER COLUMN school_id  TYPE UUID USING school_id::uuid;

-- tutoring_groups
ALTER TABLE tutoring_groups ALTER COLUMN id TYPE UUID USING id::uuid;

-- tutoring_students
ALTER TABLE tutoring_students ALTER COLUMN id           TYPE UUID USING id::uuid;
ALTER TABLE tutoring_students ALTER COLUMN "tutorGroupId" TYPE UUID USING "tutorGroupId"::uuid;

-- tutoring_invitations
ALTER TABLE tutoring_invitations ALTER COLUMN id             TYPE UUID USING id::uuid;
ALTER TABLE tutoring_invitations ALTER COLUMN tutor_group_id TYPE UUID USING tutor_group_id::uuid;

-- outbox & processed_events (internal IDs only; event_id / correlation_id stay TEXT)
ALTER TABLE outbox           ALTER COLUMN id TYPE UUID USING id::uuid;
ALTER TABLE processed_events ALTER COLUMN id TYPE UUID USING id::uuid;

-- ─── Step 3: Re-add FK constraints ──────────────────────────────────────────

ALTER TABLE school_members ADD CONSTRAINT "school_members_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES schools(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE school_invitations ADD CONSTRAINT "school_invitations_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES schools(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE school_groups ADD CONSTRAINT "school_groups_school_id_fkey"
  FOREIGN KEY (school_id) REFERENCES schools(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE school_group_members ADD CONSTRAINT "school_group_members_group_id_fkey"
  FOREIGN KEY (group_id) REFERENCES school_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE group_teachers ADD CONSTRAINT "group_teachers_group_id_fkey"
  FOREIGN KEY (group_id) REFERENCES school_groups(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE school_teachers ADD CONSTRAINT "school_teachers_member_id_fkey"
  FOREIGN KEY (member_id) REFERENCES school_members(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE school_member_permissions ADD CONSTRAINT "school_member_permissions_member_id_fkey"
  FOREIGN KEY (member_id) REFERENCES school_members(id) ON DELETE CASCADE;

ALTER TABLE tutoring_students ADD CONSTRAINT "tutoring_students_tutorGroupId_fkey"
  FOREIGN KEY ("tutorGroupId") REFERENCES tutoring_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE tutoring_invitations ADD CONSTRAINT "tutoring_invitations_tutor_group_id_fkey"
  FOREIGN KEY (tutor_group_id) REFERENCES tutoring_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT;
