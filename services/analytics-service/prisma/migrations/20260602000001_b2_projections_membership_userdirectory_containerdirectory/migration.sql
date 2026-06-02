-- ─── ProcessedEvent: add processorId, swap unique constraint ─────────────────
-- Each projection consumer tracks its own processed set so multiple consumers
-- can independently process the same eventId without colliding.

ALTER TABLE "processed_events" ADD COLUMN "processor_id" TEXT NOT NULL DEFAULT 'archive';

-- Remove the old single-column unique index and replace with composite.
DROP INDEX "processed_events_event_id_key";

-- Clear the DEFAULT — all existing rows get 'archive', new rows must supply it.
ALTER TABLE "processed_events" ALTER COLUMN "processor_id" DROP DEFAULT;

-- ─── Projection: SchoolMembership ─────────────────────────────────────────────

CREATE TABLE "school_membership" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_membership_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "school_membership_school_id_idx" ON "school_membership"("school_id");
CREATE INDEX "school_membership_user_id_idx" ON "school_membership"("user_id");
CREATE UNIQUE INDEX "school_membership_school_id_user_id_key" ON "school_membership"("school_id", "user_id");

-- ─── Projection: UserDirectory ────────────────────────────────────────────────

CREATE TABLE "user_directory" (
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_directory_pkey" PRIMARY KEY ("user_id")
);

-- ─── Projection: ContainerDirectory ──────────────────────────────────────────

CREATE TABLE "container_directory" (
    "container_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "owner_school_id" TEXT,
    "container_type" TEXT NOT NULL,
    "leaf_item_count" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "container_directory_pkey" PRIMARY KEY ("container_id")
);

CREATE INDEX "container_directory_owner_school_id_idx" ON "container_directory"("owner_school_id");

-- ─── ProcessedEvent: composite unique index ───────────────────────────────────

CREATE INDEX "processed_events_processor_id_idx" ON "processed_events"("processor_id");
CREATE UNIQUE INDEX "processed_events_event_id_processor_id_key" ON "processed_events"("event_id", "processor_id");
