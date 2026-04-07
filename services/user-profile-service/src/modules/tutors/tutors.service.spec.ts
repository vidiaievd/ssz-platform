import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ProfileType, TutorProficiency } from '@prisma/client';
import { TutorsService } from './tutors.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { RabbitMQService } from '../../infrastructure/messaging/rabbitmq.service';

const tutorProfile = {
  id: 'profile-uuid',
  userId: 'user-uuid',
  displayName: 'tutor-user',
  profileType: ProfileType.TUTOR,
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

const mockTutorProfile = {
  id: 'tutor-profile-uuid',
  profileId: 'profile-uuid',
  headline: 'Expert tutor',
  yearsOfExperience: 5,
  hourlyRate: null,
  currency: null,
  isAvailableForHire: true,
};

const mockPrisma = {
  tutorProfile: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  tutorLanguage: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  tutorQualification: {
    create: jest.fn(),
  },
};

const mockProfilesRepository = {
  findByUserId: jest.fn(),
};

const mockRabbitMQService = {
  publish: jest.fn().mockResolvedValue(undefined),
};

describe('TutorsService', () => {
  let service: TutorsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TutorsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProfilesRepository, useValue: mockProfilesRepository },
        { provide: RabbitMQService, useValue: mockRabbitMQService },
      ],
    }).compile();

    service = module.get<TutorsService>(TutorsService);
    jest.clearAllMocks();
  });

  // ─── upsertTutorProfile ───────────────────────────────────────────────────

  describe('upsertTutorProfile', () => {
    it('creates a tutor profile successfully', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(tutorProfile);
      mockPrisma.tutorProfile.findUnique.mockResolvedValueOnce(null);
      mockPrisma.tutorProfile.create.mockResolvedValue(mockTutorProfile);
      mockPrisma.tutorProfile.findUnique.mockResolvedValueOnce({
        ...mockTutorProfile,
        languages: [],
      });

      const result = await service.upsertTutorProfile('user-uuid', {
        headline: 'Expert tutor',
        yearsOfExperience: 5,
      });

      expect(result).toEqual(mockTutorProfile);
      expect(mockPrisma.tutorProfile.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when profile does not exist', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(null);

      await expect(
        service.upsertTutorProfile('user-uuid', {
          headline: 'Expert tutor',
          yearsOfExperience: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for a student profile', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue({
        ...tutorProfile,
        profileType: ProfileType.STUDENT,
      });

      await expect(
        service.upsertTutorProfile('user-uuid', {
          headline: 'Expert tutor',
          yearsOfExperience: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── addLanguage ──────────────────────────────────────────────────────────

  describe('addLanguage', () => {
    it('adds a teaching language successfully', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(tutorProfile);
      mockPrisma.tutorProfile.findUnique.mockResolvedValue(mockTutorProfile);
      mockPrisma.tutorLanguage.findUnique.mockResolvedValue(null);

      const newLang = {
        id: 'lang-uuid',
        tutorProfileId: 'tutor-profile-uuid',
        languageCode: 'no',
        proficiency: TutorProficiency.NATIVE,
        teachesLevels: ['A1', 'A2'],
      };
      mockPrisma.tutorLanguage.create.mockResolvedValue(newLang);

      const result = await service.addLanguage('user-uuid', {
        languageCode: 'no',
        proficiency: TutorProficiency.NATIVE,
        teachesLevels: ['A1', 'A2'],
      });

      expect(result.languageCode).toBe('no');
    });

    it('throws ConflictException when language already exists', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(tutorProfile);
      mockPrisma.tutorProfile.findUnique.mockResolvedValue(mockTutorProfile);
      mockPrisma.tutorLanguage.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(
        service.addLanguage('user-uuid', {
          languageCode: 'no',
          proficiency: TutorProficiency.NATIVE,
          teachesLevels: ['A1'],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── addQualification ─────────────────────────────────────────────────────

  describe('addQualification', () => {
    it('creates a qualification entry', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(tutorProfile);
      mockPrisma.tutorProfile.findUnique.mockResolvedValue(mockTutorProfile);

      const qual = {
        id: 'qual-uuid',
        tutorProfileId: 'tutor-profile-uuid',
        title: 'CELTA',
        institution: 'Cambridge',
        year: 2020,
        verificationStatus: 'PENDING',
        documentUrl: null,
        createdAt: new Date(),
      };
      mockPrisma.tutorQualification.create.mockResolvedValue(qual);

      const result = await service.addQualification('user-uuid', {
        title: 'CELTA',
        institution: 'Cambridge',
        year: 2020,
      });

      expect(result.title).toBe('CELTA');
    });
  });
});
