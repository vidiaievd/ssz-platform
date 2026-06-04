-- CreateTable: ProcessedEvent (idempotency guard per consumer)
CREATE TABLE "processed_events" (
    "id"           TEXT NOT NULL,
    "event_id"     TEXT NOT NULL,
    "processor_id" TEXT NOT NULL,
    "event_type"   TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_event_id_processor_id_key" ON "processed_events"("event_id", "processor_id");
CREATE INDEX "processed_events_processor_id_idx" ON "processed_events"("processor_id");
