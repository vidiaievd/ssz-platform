import { TeachingProfile } from '../../domain/entities/teaching-profile.entity.js';

export type PrismaTeachingProfile = {
  id: string;
  profileId: string;
  createdAt: Date;
  updatedAt: Date;
  languages: Array<{
    id: string;
    teachingProfileId: string;
    code: string;
    level: string | null;
    createdAt: Date;
  }>;
};

export class TeachingProfileMapper {
  static toDomain(raw: PrismaTeachingProfile): TeachingProfile {
    return TeachingProfile.rehydrate({
      id: raw.id,
      profileId: raw.profileId,
      languages: raw.languages.map((l) => ({
        code: l.code,
        level: l.level ?? undefined,
      })),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
