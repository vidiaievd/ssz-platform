import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { StudentProfile, StudentTargetLanguage, ProfileType } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { UpsertStudentProfileDto } from './dto/upsert-student-profile.dto';
import { AddTargetLanguageDto } from './dto/add-target-language.dto';
import { RabbitMQService } from '../../infrastructure/messaging/rabbitmq.service';

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesRepository: ProfilesRepository,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async upsertStudentProfile(
    userId: string,
    dto: UpsertStudentProfileDto,
  ): Promise<StudentProfile> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (profile.profileType !== ProfileType.STUDENT) {
      throw new BadRequestException('This profile is not a student profile');
    }

    const existing = await this.prisma.studentProfile.findUnique({
      where: { profileId: profile.id },
    });

    let studentProfile: StudentProfile;

    if (existing) {
      studentProfile = await this.prisma.studentProfile.update({
        where: { profileId: profile.id },
        data: { nativeLanguage: dto.nativeLanguage },
      });
    } else {
      studentProfile = await this.prisma.studentProfile.create({
        data: {
          profileId: profile.id,
          nativeLanguage: dto.nativeLanguage,
        },
      });
    }

    // Check if the student profile is "complete enough" to emit the event
    const withLanguages = await this.prisma.studentProfile.findUnique({
      where: { id: studentProfile.id },
      include: { targetLanguages: true },
    });

    if (withLanguages && withLanguages.targetLanguages.length > 0) {
      await this.rabbitMQService.publish('student.profile.completed', {
        profileId: profile.id,
        userId: profile.userId,
        timestamp: new Date().toISOString(),
      });
    }

    return studentProfile;
  }

  async getStudentProfile(userId: string): Promise<StudentProfile & { targetLanguages: StudentTargetLanguage[] }> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: { profileId: profile.id },
      include: { targetLanguages: true },
    });

    if (!studentProfile) {
      throw new NotFoundException('Student profile not found');
    }

    return studentProfile;
  }

  async addTargetLanguage(
    userId: string,
    dto: AddTargetLanguageDto,
  ): Promise<StudentTargetLanguage> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: { profileId: profile.id },
    });

    if (!studentProfile) {
      throw new NotFoundException('Student profile not found. Create it first.');
    }

    // Enforce uniqueness at service level for a cleaner error message
    const exists = await this.prisma.studentTargetLanguage.findUnique({
      where: {
        studentProfileId_languageCode: {
          studentProfileId: studentProfile.id,
          languageCode: dto.languageCode,
        },
      },
    });

    if (exists) {
      throw new ConflictException(
        `Language '${dto.languageCode}' is already in your learning list`,
      );
    }

    return this.prisma.studentTargetLanguage.create({
      data: {
        studentProfileId: studentProfile.id,
        languageCode: dto.languageCode,
        currentLevel: dto.currentLevel,
        targetLevel: dto.targetLevel,
      },
    });
  }

  async removeTargetLanguage(userId: string, languageCode: string): Promise<void> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: { profileId: profile.id },
    });

    if (!studentProfile) {
      throw new NotFoundException('Student profile not found');
    }

    const record = await this.prisma.studentTargetLanguage.findUnique({
      where: {
        studentProfileId_languageCode: {
          studentProfileId: studentProfile.id,
          languageCode,
        },
      },
    });

    if (!record) {
      throw new NotFoundException(`Language '${languageCode}' not found in your learning list`);
    }

    await this.prisma.studentTargetLanguage.delete({ where: { id: record.id } });
  }
}
