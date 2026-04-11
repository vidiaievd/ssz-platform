import { TutorProfile } from '../../domain/entities/tutor-profile.entity.js';
import type {
  Proficiency,
  TeachingLanguage,
} from '../../domain/value-objects/teaching-language.vo.js';

export type PrismaTutorProfile = {
  id: string;
  profileId: string;
  hourlyRate: { toNumber(): number } | null; // Prisma Decimal
  yearsOfExperience: number | null;
  createdAt: Date;
  updatedAt: Date;
  teachingLanguages: Array<{
    id: string;
    tutorProfileId: string;
    languageCode: string;
    proficiency: string;
    createdAt: Date;
  }>;
};

export class TutorProfileMapper {
  static toDomain(raw: PrismaTutorProfile): TutorProfile {
    const teachingLanguages: TeachingLanguage[] = raw.teachingLanguages.map(
      (l) => ({
        languageCode: l.languageCode,
        proficiency: l.proficiency as Proficiency,
      }),
    );

    return TutorProfile.rehydrate({
      id: raw.id,
      profileId: raw.profileId,
      hourlyRate: raw.hourlyRate?.toNumber() ?? undefined,
      yearsOfExperience: raw.yearsOfExperience ?? undefined,
      teachingLanguages,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
