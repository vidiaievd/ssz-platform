-- CreateTable
CREATE TABLE "student_nudges" (
    "school_id" UUID NOT NULL,
    "student_id" TEXT NOT NULL,
    "last_nudged_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_nudges_pkey" PRIMARY KEY ("school_id","student_id")
);
