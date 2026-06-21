-- Denormalize display name/avatar onto school_members so roster/teacher
-- reads don't need a live call to user-profile-service. Synced via
-- profile.created/profile.updated RabbitMQ events; set once at member
-- creation time. Nullable: existing rows are backfilled separately
-- (see scripts/backfill-member-profiles.ts).
ALTER TABLE "school_members" ADD COLUMN "name" TEXT;
ALTER TABLE "school_members" ADD COLUMN "avatarUrl" TEXT;

CREATE INDEX "school_members_userId_idx" ON "school_members"("userId");
