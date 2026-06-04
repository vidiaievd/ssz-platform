-- CreateTable
CREATE TABLE "school_teachers" (
    "school_id"         TEXT NOT NULL,
    "user_id"           TEXT NOT NULL,
    "member_id"         TEXT NOT NULL,
    "max_weekly_hours"  INTEGER,
    "availability"      JSONB,
    "updated_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_teachers_pkey" PRIMARY KEY ("school_id", "user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "school_teachers_member_id_key" ON "school_teachers"("member_id");

-- AddForeignKey
ALTER TABLE "school_teachers" ADD CONSTRAINT "school_teachers_member_id_fkey"
    FOREIGN KEY ("member_id") REFERENCES "school_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
