import { StudentProfile } from '../../domain/entities/student-profile.entity.js';

// Prisma model shape including the related target languages
export type PrismaStudentProfile = {
  id: string;
  profileId: string;
  nativeLanguage: string | null;
  createdAt: Date;
  updatedAt: Date;
  targetLanguages: Array<{
    id: string;
    studentProfileId: string;
    languageCode: string;
    createdAt: Date;
  }>;
};

export class StudentProfileMapper {
  static toDomain(raw: PrismaStudentProfile): StudentProfile {
    return StudentProfile.rehydrate({
      id: raw.id,
      profileId: raw.profileId,
      nativeLanguage: raw.nativeLanguage ?? undefined,
      targetLanguages: raw.targetLanguages.map((l) => l.languageCode),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
