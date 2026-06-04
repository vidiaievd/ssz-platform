-- CreateTable
CREATE TABLE "user_email_index" (
    "user_id"    TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "roles"      TEXT[] NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_email_index_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_index_email_key" ON "user_email_index"("email");
