import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { StudentProfile } from '../../domain/entities/student-profile.entity.js';
import { IStudentProfileRepository } from '../../domain/repositories/student-profile.repository.interface.js';
import { StudentProfileMapper } from './student-profile.mapper.js';

const INCLUDE_LANGUAGES = { targetLanguages: true } as const;

@Injectable()
export class StudentProfilePrismaRepository implements IStudentProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByProfileId(profileId: string): Promise<StudentProfile | null> {
    const raw = await (this.prisma as any).studentProfile.findUnique({
      where: { profileId },
      include: INCLUDE_LANGUAGES,
    });
    return raw ? StudentProfileMapper.toDomain(raw) : null;
  }

  async save(studentProfile: StudentProfile): Promise<void> {
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.studentProfile.upsert({
        where: { id: studentProfile.id },
        create: {
          id: studentProfile.id,
          profileId: studentProfile.profileId,
          nativeLanguage: studentProfile.nativeLanguage ?? null,
        },
        update: {
          nativeLanguage: studentProfile.nativeLanguage ?? null,
        },
      });

      // Replace target languages — delete existing, re-insert current set
      await tx.studentTargetLanguage.deleteMany({
        where: { studentProfileId: studentProfile.id },
      });
      const codes = studentProfile.targetLanguages;
      if (codes.length > 0) {
        await tx.studentTargetLanguage.createMany({
          data: codes.map((languageCode: string) => ({
            studentProfileId: studentProfile.id,
            languageCode,
          })),
        });
      }
    });
  }
}
