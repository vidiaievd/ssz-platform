import { Profile } from '../../domain/entities/profile.entity.js';

type PrismaProfile = {
  id: string;
  userId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  timezone: string;
  uiLocale: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export class ProfileMapper {
  static toDomain(raw: PrismaProfile): Profile {
    return Profile.rehydrate({
      id: raw.id,
      userId: raw.userId,
      displayName: raw.displayName,
      firstName: raw.firstName ?? undefined,
      lastName: raw.lastName ?? undefined,
      avatarUrl: raw.avatarUrl ?? undefined,
      bio: raw.bio ?? undefined,
      timezone: raw.timezone,
      uiLocale: raw.uiLocale,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt ?? undefined,
    });
  }

  static toPersistence(profile: Profile): Record<string, unknown> {
    return {
      id: profile.id,
      userId: profile.userId,
      displayName: profile.displayName,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      bio: profile.bio ?? null,
      timezone: profile.timezone,
      uiLocale: profile.uiLocale,
      deletedAt: profile.deletedAt ?? null,
    };
  }
}
