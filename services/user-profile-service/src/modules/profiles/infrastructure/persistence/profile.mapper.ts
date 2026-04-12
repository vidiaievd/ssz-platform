import { Profile } from '../../domain/entities/profile.entity.js';

// Prisma model shape inferred from the generated payload type
type PrismaProfile = {
  id: string;
  userId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  timezone: string;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

// Maps between the Prisma model (infrastructure) and the domain Profile entity.
// Neither layer is aware of the other directly — this mapper sits in between.
export class ProfileMapper {
  // Prisma model → domain entity (rehydrate: no domain events raised)
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
      locale: raw.locale,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt ?? undefined,
    });
  }

  // Domain entity → Prisma persistence data
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
      locale: profile.locale,
      deletedAt: profile.deletedAt ?? null,
    };
  }
}
