import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { TutorProfile } from '../../domain/entities/tutor-profile.entity.js';
import { ITutorProfileRepository } from '../../domain/repositories/tutor-profile.repository.interface.js';
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
