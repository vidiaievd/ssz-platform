-- CreateTable
CREATE TABLE "school_groups" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "school_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_groups_school_id_idx" ON "school_groups"("school_id");

-- CreateIndex
CREATE INDEX "school_group_members_user_id_idx" ON "school_group_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_group_members_group_id_user_id_key" ON "school_group_members"("group_id", "user_id");

-- AddForeignKey
ALTER TABLE "school_groups" ADD CONSTRAINT "school_groups_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_group_members" ADD CONSTRAINT "school_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "school_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
