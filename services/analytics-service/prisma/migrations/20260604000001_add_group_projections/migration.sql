-- CreateTable: GroupDirectory
CREATE TABLE "group_directory" (
    "group_id"   TEXT NOT NULL,
    "school_id"  TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "lang"       TEXT,
    "level"      TEXT,
    "course_id"  TEXT,
    "status"     TEXT NOT NULL DEFAULT 'draft',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_directory_pkey" PRIMARY KEY ("group_id")
);

-- CreateIndex
CREATE INDEX "group_directory_school_id_idx" ON "group_directory"("school_id");

-- CreateTable: GroupMembership
CREATE TABLE "group_membership" (
    "id"         TEXT NOT NULL,
    "group_id"   TEXT NOT NULL,
    "school_id"  TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,

    CONSTRAINT "group_membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "group_membership_group_id_user_id_key" ON "group_membership"("group_id", "user_id");
CREATE INDEX "group_membership_school_id_user_id_idx" ON "group_membership"("school_id", "user_id");
CREATE INDEX "group_membership_group_id_idx" ON "group_membership"("group_id");
