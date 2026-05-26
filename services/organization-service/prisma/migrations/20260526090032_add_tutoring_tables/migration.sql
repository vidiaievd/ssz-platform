-- CreateTable
CREATE TABLE "tutoring_groups" (
    "id" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tutoring_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutoring_students" (
    "id" TEXT NOT NULL,
    "tutorGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutoring_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutoring_invitations" (
    "id" TEXT NOT NULL,
    "tutorGroupId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutoring_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutoring_groups_tutorId_key" ON "tutoring_groups"("tutorId");

-- CreateIndex
CREATE UNIQUE INDEX "tutoring_students_tutorGroupId_userId_key" ON "tutoring_students"("tutorGroupId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "tutoring_invitations_token_key" ON "tutoring_invitations"("token");

-- AddForeignKey
ALTER TABLE "tutoring_students" ADD CONSTRAINT "tutoring_students_tutorGroupId_fkey" FOREIGN KEY ("tutorGroupId") REFERENCES "tutoring_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutoring_invitations" ADD CONSTRAINT "tutoring_invitations_tutorGroupId_fkey" FOREIGN KEY ("tutorGroupId") REFERENCES "tutoring_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
