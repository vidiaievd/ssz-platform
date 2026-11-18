-- The student seat limit of a school as subscription-service last told it (plan 90, phase 4,
-- step 2). A projection: no foreign key to schools — a snapshot may arrive before the school
-- row is read, and dropping a school leaves nothing to keep consistent. Written by hand, like
-- the previous migrations: the dev database carries drift from older ones.

CREATE TABLE "school_seat_limits" (
  "school_id"   UUID         NOT NULL,
  "max_seats"   INTEGER,
  "version"     INTEGER      NOT NULL,
  "valid_until" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "school_seat_limits_pkey" PRIMARY KEY ("school_id")
);
