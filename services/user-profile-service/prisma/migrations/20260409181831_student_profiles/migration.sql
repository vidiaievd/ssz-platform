-- CreateTable
CREATE TABLE "student_profiles" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "nativeLanguage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_target_languages" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_target_languages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_profileId_key" ON "student_profiles"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "student_target_languages_studentProfileId_languageCode_key" ON "student_target_languages"("studentProfileId", "languageCode");

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_target_languages" ADD CONSTRAINT "student_target_languages_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
