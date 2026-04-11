import type { Prisma } from '../../../../../generated/prisma/client.js';
import { Profile } from '../../domain/entities/profile.entity.js';
import { ProfileType } from '../../domain/value-objects/profile-type.vo.js';

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
  profileType: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

// Prisma create input shape
type ProfileCreateInput = Prisma.ProfileUncheckedCreateInput;

// Maps between the Prisma model (infrastructure) and the domain Profile entity.
// Neither layer is aware of the other directly — this mapper sits in between.
export class ProfileMapper {
  // Prisma model → domain entity (rehydrate: no domain events raised)
  static toDomain(raw: PrismaProfile): Profile {
    return Profile.rehydrate({
      id: raw.id,
      userId: raw.userId,
      displayName: raw.displayName,
      // Prisma and domain enum values are identical strings (STUDENT / TUTOR)
      profileType: raw.profileType as ProfileType,
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

  // Domain entity → Prisma create input
  static toPersistence(profile: Profile): ProfileCreateInput {
    return {
      id: profile.id,
      userId: profile.userId,
      displayName: profile.displayName,
      profileType: profile.profileType,
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
