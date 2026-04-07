import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ProfileType, LanguageLevel } from '@prisma/client';
import { StudentsService } from './students.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { RabbitMQService } from '../../infrastructure/messaging/rabbitmq.service';

const studentProfile = {
  id: 'profile-uuid',
  userId: 'user-uuid',
  displayName: 'testuser',
  profileType: ProfileType.STUDENT,
  firstName: null,
  lastName: null,
  avatarUrl: null,
  bio: null,
  timezone: 'UTC',
  locale: 'en',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockStudentProfile = {
  id: 'student-profile-uuid',
  profileId: 'profile-uuid',
  nativeLanguage: 'uk',
  currentStreakDays: 0,
  totalStudyMinutes: 0,
  xpPoints: 0,
};

const mockPrisma = {
  studentProfile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  studentTargetLanguage: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
};

const mockProfilesRepository = {
  findByUserId: jest.fn(),
};

const mockRabbitMQService = {
  publish: jest.fn().mockResolvedValue(undefined),
};

describe('StudentsService', () => {
  let service: StudentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProfilesRepository, useValue: mockProfilesRepository },
        { provide: RabbitMQService, useValue: mockRabbitMQService },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
    jest.clearAllMocks();
  });

  // ─── upsertStudentProfile ─────────────────────────────────────────────────

  describe('upsertStudentProfile', () => {
    it('creates student profile when it does not exist', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(studentProfile);
      mockPrisma.studentProfile.findUnique.mockResolvedValueOnce(null);
      mockPrisma.studentProfile.create.mockResolvedValue(mockStudentProfile);
      mockPrisma.studentProfile.findUnique.mockResolvedValueOnce({
        ...mockStudentProfile,
        targetLanguages: [],
      });

      const result = await service.upsertStudentProfile('user-uuid', {
        nativeLanguage: 'uk',
      });

      expect(result).toEqual(mockStudentProfile);
      expect(mockPrisma.studentProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nativeLanguage: 'uk' }),
        }),
      );
    });

    it('throws NotFoundException when base profile is missing', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(null);

      await expect(
        service.upsertStudentProfile('user-uuid', { nativeLanguage: 'uk' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for a tutor profile', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue({
        ...studentProfile,
        profileType: ProfileType.TUTOR,
      });

      await expect(
        service.upsertStudentProfile('user-uuid', { nativeLanguage: 'uk' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── addTargetLanguage ────────────────────────────────────────────────────

  describe('addTargetLanguage', () => {
    it('adds a new target language successfully', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(studentProfile);
      mockPrisma.studentProfile.findUnique.mockResolvedValue(mockStudentProfile);
      mockPrisma.studentTargetLanguage.findUnique.mockResolvedValue(null);

      const newLang = {
        id: 'lang-uuid',
        studentProfileId: 'student-profile-uuid',
        languageCode: 'no',
        currentLevel: LanguageLevel.A1,
        targetLevel: LanguageLevel.B2,
        startedAt: new Date(),
      };
      mockPrisma.studentTargetLanguage.create.mockResolvedValue(newLang);

      const result = await service.addTargetLanguage('user-uuid', {
        languageCode: 'no',
        currentLevel: LanguageLevel.A1,
        targetLevel: LanguageLevel.B2,
      });

      expect(result.languageCode).toBe('no');
    });

    it('throws ConflictException when language already exists', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(studentProfile);
      mockPrisma.studentProfile.findUnique.mockResolvedValue(mockStudentProfile);
      mockPrisma.studentTargetLanguage.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.addTargetLanguage('user-uuid', {
          languageCode: 'no',
          currentLevel: LanguageLevel.A1,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
