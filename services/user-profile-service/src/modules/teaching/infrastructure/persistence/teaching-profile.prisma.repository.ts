import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { ITeachingProfileRepository } from '../../domain/repositories/teaching-profile.repository.interface.js';
import { TeachingProfile } from '../../domain/entities/teaching-profile.entity.js';
import { TeachingProfileMapper } from './teaching-profile.mapper.js';

const INCLUDE_LANGUAGES = { languages: true } as const;

@Injectable()
export class TeachingProfilePrismaRepository implements ITeachingProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByProfileId(profileId: string): Promise<TeachingProfile | null> {
    const raw = await (this.prisma as any).teachingProfile.findUnique({
      where: { profileId },
      include: INCLUDE_LANGUAGES,
    });
    return raw ? TeachingProfileMapper.toDomain(raw) : null;
  }

  async save(profile: TeachingProfile): Promise<void> {
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.teachingProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, profileId: profile.profileId },
        update: { updatedAt: new Date() },
      });

      await tx.teachingLanguage.deleteMany({
        where: { teachingProfileId: profile.id },
      });

      const langs = profile.languages;
      if (langs.length > 0) {
        await tx.teachingLanguage.createMany({
          data: langs.map((l) => ({
            teachingProfileId: profile.id,
            code: l.code,
            level: l.level ?? null,
          })),
        });
      }
    });
  }
}
