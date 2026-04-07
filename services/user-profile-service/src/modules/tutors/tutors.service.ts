import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { TutorProfile, TutorLanguage, TutorQualification, ProfileType } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { UpsertTutorProfileDto } from './dto/upsert-tutor-profile.dto';
import { AddTutorLanguageDto } from './dto/add-tutor-language.dto';
import { AddQualificationDto } from './dto/add-qualification.dto';
import { TutorsFilterDto } from './dto/tutors-filter.dto';
import { RabbitMQService } from '../../infrastructure/messaging/rabbitmq.service';

@Injectable()
export class TutorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesRepository: ProfilesRepository,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async upsertTutorProfile(
    userId: string,
    dto: UpsertTutorProfileDto,
  ): Promise<TutorProfile> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (profile.profileType !== ProfileType.TUTOR) {
      throw new BadRequestException('This profile is not a tutor profile');
    }

    const existing = await this.prisma.tutorProfile.findUnique({
      where: { profileId: profile.id },
    });

    let tutorProfile: TutorProfile;

    if (existing) {
      tutorProfile = await this.prisma.tutorProfile.update({
        where: { profileId: profile.id },
        data: {
          headline: dto.headline,
          yearsOfExperience: dto.yearsOfExperience,
          hourlyRate: dto.hourlyRate,
          currency: dto.currency,
          isAvailableForHire: dto.isAvailableForHire ?? existing.isAvailableForHire,
        },
      });
    } else {
      tutorProfile = await this.prisma.tutorProfile.create({
        data: {
          profileId: profile.id,
          headline: dto.headline,
          yearsOfExperience: dto.yearsOfExperience,
          hourlyRate: dto.hourlyRate,
          currency: dto.currency,
          isAvailableForHire: dto.isAvailableForHire ?? true,
        },
      });
    }

    // A tutor profile is considered "complete" once both profile and at least one language are set
    const withLanguages = await this.prisma.tutorProfile.findUnique({
      where: { id: tutorProfile.id },
      include: { languages: true },
    });

    if (withLanguages && withLanguages.languages.length > 0) {
      await this.rabbitMQService.publish('tutor.profile.completed', {
        profileId: profile.id,
        userId: profile.userId,
        timestamp: new Date().toISOString(),
      });
    }

    return tutorProfile;
  }

  async getTutorProfile(
    userId: string,
  ): Promise<TutorProfile & { languages: TutorLanguage[]; qualifications: TutorQualification[] }> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const tutorProfile = await this.prisma.tutorProfile.findUnique({
      where: { profileId: profile.id },
      include: { languages: true, qualifications: true },
    });

    if (!tutorProfile) {
      throw new NotFoundException('Tutor profile not found');
    }

    return tutorProfile;
  }

  async addLanguage(userId: string, dto: AddTutorLanguageDto): Promise<TutorLanguage> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const tutorProfile = await this.prisma.tutorProfile.findUnique({
      where: { profileId: profile.id },
    });

    if (!tutorProfile) {
      throw new NotFoundException('Tutor profile not found. Create it first.');
    }

    const exists = await this.prisma.tutorLanguage.findUnique({
      where: {
        tutorProfileId_languageCode: {
          tutorProfileId: tutorProfile.id,
          languageCode: dto.languageCode,
        },
      },
    });

    if (exists) {
      throw new ConflictException(
        `Language '${dto.languageCode}' is already in your teaching list`,
      );
    }

    return this.prisma.tutorLanguage.create({
      data: {
        tutorProfileId: tutorProfile.id,
        languageCode: dto.languageCode,
        proficiency: dto.proficiency,
        teachesLevels: dto.teachesLevels,
      },
    });
  }

  async addQualification(
    userId: string,
    dto: AddQualificationDto,
  ): Promise<TutorQualification> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const tutorProfile = await this.prisma.tutorProfile.findUnique({
      where: { profileId: profile.id },
    });

    if (!tutorProfile) {
      throw new NotFoundException('Tutor profile not found. Create it first.');
    }

    return this.prisma.tutorQualification.create({
      data: {
        tutorProfileId: tutorProfile.id,
        title: dto.title,
        institution: dto.institution,
        year: dto.year,
        documentUrl: dto.documentUrl,
      },
    });
  }

  async searchTutors(filter: TutorsFilterDto) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    // Build the where clause incrementally based on provided filters
    const tutorWhere: Record<string, unknown> = {};

    if (filter.maxRate !== undefined) {
      tutorWhere['hourlyRate'] = { lte: filter.maxRate };
    }

    tutorWhere['isAvailableForHire'] = true;

    const languageFilter: Record<string, unknown> = {};

    if (filter.language) {
      languageFilter['languageCode'] = filter.language;
    }

    if (filter.level) {
      // teachesLevels is an array — check if it contains the requested level
      languageFilter['teachesLevels'] = { has: filter.level };
    }

    if (Object.keys(languageFilter).length > 0) {
      tutorWhere['languages'] = { some: languageFilter };
    }

    const [tutors, total] = await Promise.all([
      this.prisma.tutorProfile.findMany({
        where: tutorWhere,
        include: {
          profile: {
            select: {
              userId: true,
              displayName: true,
              avatarUrl: true,
              bio: true,
            },
          },
          languages: true,
        },
        skip,
        take: limit,
      }),
      this.prisma.tutorProfile.count({ where: tutorWhere }),
    ]);

    return {
      data: tutors,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
