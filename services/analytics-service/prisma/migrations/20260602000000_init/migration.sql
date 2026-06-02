-- CreateTable
CREATE TABLE "event_archive" (
    "id" TEXT NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "routing_key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_archive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_archive_sequence_key" ON "event_archive"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "event_archive_event_id_key" ON "event_archive"("event_id");

-- CreateIndex
CREATE INDEX "event_archive_event_type_occurred_at_idx" ON "event_archive"("event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "event_archive_occurred_at_idx" ON "event_archive"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_event_id_key" ON "processed_events"("event_id");
