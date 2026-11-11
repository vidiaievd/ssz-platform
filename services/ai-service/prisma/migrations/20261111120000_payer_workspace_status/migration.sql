-- Plan 90, phase 5, step 6: a school's lifecycle status, projected from `school.*` events.
CREATE TABLE "payer_workspace_status" (
    "school_id" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payer_workspace_status_pkey" PRIMARY KEY ("school_id")
);
