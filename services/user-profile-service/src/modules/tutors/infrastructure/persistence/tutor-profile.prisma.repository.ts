import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { TutorListResultDto } from '../../application/dto/tutor-list-item.dto.js';
import type { TutorListFilters } from '../../domain/repositories/tutor-profile.repository.interface.js';
import { ITutorProfileRepository } from '../../domain/repositories/tutor-profile.repository.interface.js';
import { TutorProfile } from '../../domain/entities/tutor-profile.entity.js';
import type { Proficiency } from '../../domain/value-objects/teaching-language.vo.js';
import { TutorProfileMapper } from './tutor-profile.mapper.js';

const INCLUDE_LANGUAGES = { teachingLanguages: true } as const;

@Injectable()
export class TutorProfilePrismaRepository implements ITutorProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByProfileId(profileId: string): Promise<TutorProfile | null> {
    const raw = await (this.prisma as any).tutorProfile.findUnique({
      where: { profileId },
      include: INCLUDE_LANGUAGES,
    });
    return raw ? TutorProfileMapper.toDomain(raw) : null;
  }

  async list(filters: TutorListFilters): Promise<TutorListResultDto> {
    const prisma = this.prisma as any;

    // Build the tutor_profiles where clause
    const tutorWhere: any = {};
    if (filters.maxHourlyRate !== undefined) {
      tutorWhere.hourlyRate = { lte: filters.maxHourlyRate };
    }
    if (filters.languageCode) {
      tutorWhere.teachingLanguages = {
        some: { languageCode: filters.languageCode },
      };
    }

    const [rows, total] = await Promise.all([
      prisma.tutorProfile.findMany({
        where: tutorWhere,
        include: {
          teachingLanguages: true,
          profile: {
            select: {
              userId: true,
              displayName: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              bio: true,
              deletedAt: true,
            },
          },
        },
        skip: filters.offset,
        take: filters.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.tutorProfile.count({ where: tutorWhere }),
    ]);

    const items = rows
      // Exclude soft-deleted base profiles
      .filter((r: any) => r.profile.deletedAt === null)
      .map((r: any) => ({
        profileId: r.id,
        userId: r.profile.userId,
        displayName: r.profile.displayName,
        firstName: r.profile.firstName ?? undefined,
        lastName: r.profile.lastName ?? undefined,
        avatarUrl: r.profile.avatarUrl ?? undefined,
        bio: r.profile.bio ?? undefined,
        hourlyRate: r.hourlyRate?.toNumber() ?? undefined,
        yearsOfExperience: r.yearsOfExperience ?? undefined,
        teachingLanguages: r.teachingLanguages.map((l: any) => ({
          languageCode: l.languageCode,
          proficiency: l.proficiency as Proficiency,
        })),
      }));

    return { items, total, limit: filters.limit, offset: filters.offset };
  }

  async save(tutorProfile: TutorProfile): Promise<void> {
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.tutorProfile.upsert({
        where: { id: tutorProfile.id },
        create: {
          id: tutorProfile.id,
          profileId: tutorProfile.profileId,
          hourlyRate: tutorProfile.hourlyRate ?? null,
          yearsOfExperience: tutorProfile.yearsOfExperience ?? null,
        },
        update: {
          hourlyRate: tutorProfile.hourlyRate ?? null,
          yearsOfExperience: tutorProfile.yearsOfExperience ?? null,
        },
      });

      // Replace teaching languages atomically
      await tx.tutorTeachingLanguage.deleteMany({
        where: { tutorProfileId: tutorProfile.id },
      });
      const langs = tutorProfile.teachingLanguages;
      if (langs.length > 0) {
        await tx.tutorTeachingLanguage.createMany({
          data: langs.map((l) => ({
            tutorProfileId: tutorProfile.id,
            languageCode: l.languageCode,
            proficiency: l.proficiency,
          })),
        });
      }
    });
  }
}
