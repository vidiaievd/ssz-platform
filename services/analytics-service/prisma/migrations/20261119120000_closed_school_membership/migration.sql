-- The roster of a closed school, set aside until it is restored or purged (plan 90, phase 5, Q13).
-- Same columns as `school_membership`; the ids move with the rows.

CREATE TABLE "closed_school_membership" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closed_school_membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "closed_school_membership_school_id_user_id_key" ON "closed_school_membership"("school_id", "user_id");
CREATE INDEX "closed_school_membership_school_id_idx" ON "closed_school_membership"("school_id");
